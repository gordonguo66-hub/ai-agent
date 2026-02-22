import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// CRITICAL: Next.js 14 caches fetch() by default. The Supabase client uses fetch internally.
// Without this, the Supabase query response gets cached and returns stale last_tick_at values,
// causing the cadence check to always skip sessions (processed: 0 forever).
export const dynamic = 'force-dynamic';

/**
 * Server-side cron job to tick all running sessions
 * This runs 24/7 on the server, independent of client connections
 * 
 * Configure this to run every minute (or based on minimum cadence)
 * - Vercel Cron: Add to vercel.json
 * - External Cron: Call this endpoint periodically
 * - Supabase pg_cron: Schedule via SQL
 */
export async function GET(request: NextRequest) {
  // Security: Verify this is called by cron service with proper auth
  // Vercel crons send CRON_SECRET, external crons may use INTERNAL_API_KEY
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_KEY;
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  
  // Log for debugging
  console.log(`[Cron] Request received - Has Secret: ${!!cronSecret}, Has Auth Header: ${!!authHeader}`);

  // CRITICAL FIX: Always require authentication. If no secret is configured,
  // reject the request rather than allowing unauthenticated access.
  // This prevents anyone from triggering all session ticks in production.
  if (!cronSecret) {
    console.error(`[Cron] ❌ REJECTED: No INTERNAL_API_KEY or CRON_SECRET configured. Set one of these environment variables to enable the cron endpoint.`);
    return NextResponse.json({ error: "Cron endpoint not configured - INTERNAL_API_KEY or CRON_SECRET required" }, { status: 503 });
  }

  const expectedAuth = `Bearer ${cronSecret}`;
  if (!authHeader || authHeader !== expectedAuth) {
    console.error(`[Cron] Unauthorized - auth header ${authHeader ? 'present but invalid' : 'missing'}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log(`[Cron] ✅ Authentication successful`);
  
  console.log(`[Cron] ✅ Tick-all-sessions endpoint called at ${new Date().toISOString()}`);

  try {
    const serviceClient = createServiceRoleClient();
    
    // Get all running sessions
    // CRITICAL: Load strategy filters to get current cadence (not session's stored cadence_seconds which may be outdated)
    // INVARIANT: This query MUST include ALL modes (virtual, live, arena) - mode does NOT affect tick eligibility
    const { data: runningSessions, error: sessionsError } = await serviceClient
      .from("strategy_sessions")
      .select(`
        id,
        mode,
        status,
        last_tick_at,
        cadence_seconds,
        started_at,
        markets,
        strategies!inner(
          id,
          filters
        )
      `)
      .eq("status", "running");

    if (sessionsError) {
      console.error("[Cron] Error fetching running sessions:", sessionsError);
      return NextResponse.json(
        { error: "Failed to fetch sessions", details: sessionsError.message },
        { status: 500 }
      );
    }

    if (!runningSessions || runningSessions.length === 0) {
      return NextResponse.json({
        message: "No running sessions to tick",
        processed: 0,
      });
    }

    console.log(`[Cron] Found ${runningSessions.length} running session(s)`);

    const now = Date.now();
    const processed: string[] = [];
    const skipped: string[] = [];

    // Process sessions in parallel batches for scalability
    // Process up to 50 sessions concurrently to avoid overwhelming the system
    const BATCH_SIZE = 50;
    
    // Determine the app URL for internal tick calls.
    // Priority: NEXT_PUBLIC_APP_URL env var > request host > localhost fallback.
    // Vercel preview deployments are rejected (they contain random subdomains).
    let appUrl: string | undefined;
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host');

    // Helper: detect Vercel preview deployments by their URL pattern
    // Preview URLs contain random hashes like: project-abc123-team.vercel.app
    const isVercelPreview = (url: string) => /\.vercel\.app$/.test(url) && /^[^.]*-[a-z0-9]{6,}/.test(url);

    // 1. Prefer NEXT_PUBLIC_APP_URL (explicitly configured production domain)
    if (process.env.NEXT_PUBLIC_APP_URL) {
      const envUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (isVercelPreview(envUrl.replace(/^https?:\/\//, ''))) {
        console.error(`[Cron] NEXT_PUBLIC_APP_URL is a preview URL: ${envUrl}. Set this to your production domain.`);
      } else {
        appUrl = envUrl;
        console.log(`[Cron] Using NEXT_PUBLIC_APP_URL: ${appUrl}`);
      }
    }

    // 2. Fallback to request host (reliable when cron runs on production)
    if (!appUrl && host) {
      if (host.includes('localhost')) {
        appUrl = `http://localhost:3000`;
        console.log(`[Cron] Detected local development, using: ${appUrl}`);
      } else if (!isVercelPreview(host)) {
        appUrl = `https://${host}`;
        console.log(`[Cron] Using request host as app URL: ${appUrl}`);
      }
    }

    // 3. No valid URL found - fail explicitly
    if (!appUrl) {
      console.error(`[Cron] CRITICAL: Cannot determine production URL. Set NEXT_PUBLIC_APP_URL to your production domain.`);
      return NextResponse.json(
        { error: "NEXT_PUBLIC_APP_URL not configured" },
        { status: 500 }
      );
    }

    // Ensure URL has protocol
    if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
      appUrl = `https://${appUrl}`;
    }
    
    const internalApiKey = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET || '';
    
    if (!internalApiKey) {
      console.warn(`[Cron] ⚠️ WARNING: INTERNAL_API_KEY or CRON_SECRET not set! Tick endpoint may reject internal calls.`);
    }
    
    console.log(`[Cron] Using app URL: ${appUrl} (Internal API Key: ${internalApiKey ? 'SET' : 'NOT SET'})`);

    // Filter sessions that need ticking first (to reduce parallel processing)
    // Filter sessions that need ticking
    const sessionsToTick = runningSessions.filter((session) => {
      // CRITICAL: strategies is an array from Supabase join, get first element
      const strategy = Array.isArray(session.strategies) ? session.strategies[0] : session.strategies;
      const strategyFilters = (strategy as any)?.filters || {};
      
      // CRITICAL: Always use strategy filters cadence (most up-to-date)
      // Session cadence_seconds may be outdated if strategy was edited after session creation
      // Strategy filters cadence is the source of truth
      // Also ensure we're reading the LATEST last_tick_at from database
      let cadenceSeconds = strategyFilters.cadenceSeconds;
      const cadenceSource = strategyFilters.cadenceSeconds ? 'strategyFilters' : 'session';
      const strategyId = (strategy as any)?.id;
      
      // Log cadence source (compact)
      
      // CRITICAL FIX: Only fall back to session cadence if strategy filters has NO cadence
      // Otherwise, always use strategy filters (even if it differs from session)
      // This ensures edits to strategy cadence take effect immediately
      if (!cadenceSeconds || cadenceSeconds <= 0 || !Number.isInteger(Number(cadenceSeconds))) {
        cadenceSeconds = session.cadence_seconds || 30;
        console.warn(`[Cron] ⚠️ Session ${session.id} has no valid cadence in strategy filters, using session.cadence_seconds: ${cadenceSeconds}s`);
      } else {
        // Strategy has cadence - use it (ignore session.cadence_seconds which may be outdated)
        // Strategy cadence takes precedence over session cadence
      }
      cadenceSeconds = Number(cadenceSeconds); // Convert to number explicitly
      
      if (isNaN(cadenceSeconds) || cadenceSeconds <= 0) {
        console.warn(`[Cron] ⚠️ Session ${session.id} has invalid cadence (${cadenceSeconds}), using default 30s`);
        cadenceSeconds = 30;
      }
      
      // Cadence resolved
      
      const cadenceMs = cadenceSeconds * 1000;

      const lastTickAt = session.last_tick_at 
        ? new Date(session.last_tick_at).getTime() 
        : session.started_at 
        ? new Date(session.started_at).getTime() 
        : 0; // If never ticked and no started_at, tick immediately

      // If never ticked, always tick
      if (!lastTickAt || lastTickAt === 0) {
        console.log(`[Cron] Session ${session.id} has never been ticked - will tick now (cadence: ${cadenceSeconds}s)`);
        return true;
      }

      const timeSinceLastTick = now - lastTickAt;
      const timeSinceLastTickSeconds = Math.floor(timeSinceLastTick / 1000);
      
      // CRITICAL FIX: Add NEGATIVE tolerance to account for cron timing variance
      // Problem: cron-job.org doesn't run at EXACTLY 60s intervals - it might run at 58s, 59s, 61s, etc.
      // When cron runs slightly EARLY (e.g., at 58s), the check fails and we skip.
      // Then next cron runs at ~118s total, creating 120s gaps.
      // Solution: Subtract 5s from cadence threshold (tick if >= 55s for 60s cadence)
      // This ensures we tick on EVERY cron run, even if it's slightly early.
      const toleranceMs = 5000; // 5 seconds early is acceptable
      const shouldTick = timeSinceLastTick >= (cadenceMs - toleranceMs);
      
      if (shouldTick) {
        const delaySeconds = timeSinceLastTickSeconds - cadenceSeconds;
        console.log(`[Cron] 🔔 ${session.id.slice(0, 8)} TICKING (${timeSinceLastTickSeconds}s/${cadenceSeconds}s)${delaySeconds > 0 ? ` ${delaySeconds}s late` : ''}`);
      } else {
        const nextTickInSeconds = Math.ceil((cadenceMs - timeSinceLastTick) / 1000);
        console.log(`[Cron] ⏭️ ${session.id.slice(0, 8)} skip (${timeSinceLastTickSeconds}s/${cadenceSeconds}s, next in ${nextTickInSeconds}s)`);
      }
      
      return shouldTick;
    });

    // BUGFIX: Use the complement of sessionsToTick to avoid sessions appearing in both lists.
    // Previously used a different threshold (cadenceMs vs cadenceMs - toleranceMs), causing
    // sessions in the tolerance window to appear in both lists.
    const tickSessionIds = new Set(sessionsToTick.map(s => s.id));
    const sessionsToSkip = runningSessions.filter(s => !tickSessionIds.has(s.id));

    // Skip logging already done above in compact format

    console.log(`[Cron] Processing ${sessionsToTick.length} sessions that need ticking (skipping ${sessionsToSkip.length})`);

    // Process sessions in batches to avoid overwhelming the system
    for (let i = 0; i < sessionsToTick.length; i += BATCH_SIZE) {
      const batch = sessionsToTick.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (session) => {
          try {
            const strategy = Array.isArray(session.strategies) ? session.strategies[0] : session.strategies;
            const strategyFilters = (strategy as any)?.filters || {};
            let cadenceSeconds = strategyFilters.cadenceSeconds;
            if (!cadenceSeconds || cadenceSeconds <= 0) {
              cadenceSeconds = session.cadence_seconds || 30;
            }
            cadenceSeconds = Number(cadenceSeconds);
            const lastTickAt = session.last_tick_at 
              ? new Date(session.last_tick_at).getTime() 
              : session.started_at 
              ? new Date(session.started_at).getTime() 
              : now;
            const timeSinceLastTick = Math.floor((now - lastTickAt) / 1000);

            // INVARIANT LOG: Every tick must log session mode and markets to verify pipeline is mode-agnostic
            console.log(`[Cron] 🎯 Ticking session ${session.id} | mode=${session.mode || 'unknown'} | markets=${(session.markets || []).join(',')} | ${timeSinceLastTick}s since last tick`);

            const tickUrl = `${appUrl}/api/sessions/${session.id}/tick`;
            
            // Build headers with internal API key for authentication
            const headers: HeadersInit = {
              "Content-Type": "application/json",
            };
            
            if (internalApiKey) {
              headers["X-Internal-API-Key"] = internalApiKey;
              // API key header attached
            } else {
              console.error(`[Cron] No internal API key set. Set INTERNAL_API_KEY in environment variables.`);
            }
            
            const tickResponse = await fetch(tickUrl, {
              method: "POST",
              headers,
              // Set a timeout to prevent hanging
              signal: AbortSignal.timeout(30000), // 30 second timeout
            });

            if (tickResponse.ok) {
              // Check if the tick was actually executed or just lock-skipped
              let tickBody: any = {};
              try { tickBody = await tickResponse.clone().json(); } catch {}
              if (tickBody.skipped && tickBody.reason === 'tick_lock_failed') {
                // Lock failed — session was ticked recently by another source
                const lockSkipMsg = `${session.id.slice(0, 8)} (lock: minInterval=${tickBody.minIntervalMs}ms)`;
                skipped.push(lockSkipMsg);
                console.log(`[Cron] 🔒 Lock-skipped ${lockSkipMsg}`);
                return { sessionId: session.id, success: false, error: 'lock_skipped' };
              }
              processed.push(session.id);
              // Log response body to diagnose if AI calls are actually happening
              const decisionsCount = tickBody.decisions?.length || 0;
              const firstDecision = tickBody.decisions?.[0];
              console.log(`[Cron] ✅ Ticked ${session.id.slice(0, 8)} | decisions=${decisionsCount} | action=${firstDecision?.action_summary || 'none'} | error=${firstDecision?.error || 'none'}`);
              return { sessionId: session.id, success: true };
            } else {
              // Try to get error message from response
              let errorData: any = { error: "Unknown error" };
              let responseText = "";
              try {
                responseText = await tickResponse.text();
                if (responseText) {
                  try {
                    errorData = JSON.parse(responseText);
                  } catch {
                    // If not JSON, use the text as error
                    errorData = { error: responseText.substring(0, 200) || `HTTP ${tickResponse.status}: ${tickResponse.statusText}` };
                  }
                } else {
                  errorData = { error: `HTTP ${tickResponse.status}: ${tickResponse.statusText}` };
                }
              } catch (parseError: any) {
                errorData = { error: `Failed to parse error response: ${parseError.message}` };
              }
              
              const errorMessage = errorData.error || `HTTP ${tickResponse.status}: ${tickResponse.statusText}`;
              console.error(`[Cron] ❌ Failed to tick session ${session.id}:`, {
                status: tickResponse.status,
                statusText: tickResponse.statusText,
                error: errorData,
                responseText: responseText.substring(0, 500), // First 500 chars
                url: tickUrl,
              });
              skipped.push(`${session.id} (error: ${errorMessage})`);
              return { sessionId: session.id, success: false, error: errorMessage };
            }
          } catch (error: any) {
            console.error(`[Cron] Error processing session ${session.id}:`, error);
            skipped.push(`${session.id} (exception: ${error.message})`);
            return { sessionId: session.id, success: false, error: error.message };
          }
        })
      );

      // Log batch progress
      const batchProcessed = batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      console.log(`[Cron] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchProcessed}/${batch.length} sessions processed`);
      
      // Small delay between batches to avoid overwhelming the system
      if (i + BATCH_SIZE < sessionsToTick.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between batches
      }
    }

    // Build cadence debug info for sessions NOT ticked (helps diagnose stuck sessions)
    const cadenceDebug = sessionsToSkip.map((session) => {
      const strategy = Array.isArray(session.strategies) ? session.strategies[0] : session.strategies;
      const sf = (strategy as any)?.filters || {};
      let cs = sf.cadenceSeconds;
      if (!cs || cs <= 0) cs = session.cadence_seconds || 30;
      cs = Number(cs);
      const lt = session.last_tick_at
        ? new Date(session.last_tick_at).getTime()
        : session.started_at ? new Date(session.started_at).getTime() : 0;
      const since = lt ? Math.floor((now - lt) / 1000) : -1;
      return `${session.id.slice(0, 8)}:${since}s/${cs}s`;
    });

    return NextResponse.json({
      message: "Cron job completed",
      total: runningSessions.length,
      processed: processed.length,
      skipped: skipped.length,
      processedSessions: processed,
      skippedSessions: skipped,
      cadenceSkipped: cadenceDebug,
    });
  } catch (error: any) {
    console.error("[Cron] Fatal error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
