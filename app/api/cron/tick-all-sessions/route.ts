import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

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
  console.log(`[Cron] Request received - Has Secret: ${!!cronSecret}, Auth Header: ${authHeader ? `${authHeader.substring(0, 20)}...` : 'MISSING'}`);
  
  // CRITICAL FIX: Always require authentication. If no secret is configured,
  // reject the request rather than allowing unauthenticated access.
  // This prevents anyone from triggering all session ticks in production.
  if (!cronSecret) {
    console.error(`[Cron] ❌ REJECTED: No INTERNAL_API_KEY or CRON_SECRET configured. Set one of these environment variables to enable the cron endpoint.`);
    return NextResponse.json({ error: "Cron endpoint not configured - INTERNAL_API_KEY or CRON_SECRET required" }, { status: 503 });
  }

  const expectedAuth = `Bearer ${cronSecret}`;
  if (!authHeader || authHeader !== expectedAuth) {
    console.error(`[Cron] ❌ Unauthorized - Expected: Bearer ${cronSecret.substring(0, 8)}..., Got: ${authHeader ? `${authHeader.substring(0, 20)}...` : 'MISSING'}`);
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
    
    // CRITICAL: Use production URL - Vercel preview deployments require authentication
    // Strategy: Use request host first (cron runs on production), then NEXT_PUBLIC_APP_URL, then hardcoded fallback
    
    // First, try to get the production URL from the request host (most reliable for cron)
    // Cron jobs run on production, so the host header should be the production domain
    let appUrl: string | undefined;
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
    
    if (host && !host.includes('localhost') && !host.match(/-[a-z0-9]+-gordons-projects/)) {
      appUrl = `https://${host}`;
      console.log(`[Cron] Using request host as app URL: ${appUrl}`);
    }
    
    // If request host is a preview URL, try NEXT_PUBLIC_APP_URL
    if (!appUrl || appUrl.match(/-[a-z0-9]+-gordons-projects/)) {
      appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl) {
        // Validate it's not a preview URL
        if (appUrl.match(/-[a-z0-9]+-gordons-projects/)) {
          console.error(`[Cron] ❌ ERROR: NEXT_PUBLIC_APP_URL is set to a preview URL: ${appUrl}`);
          appUrl = undefined; // Reject it
        } else {
          console.log(`[Cron] Using NEXT_PUBLIC_APP_URL: ${appUrl}`);
        }
      }
    }
    
    // Final fallback - use request URL to determine if we're on localhost, otherwise use production
    if (!appUrl || appUrl.match(/-[a-z0-9]+-gordons-projects/)) {
      // Detect if we're in local development by checking the request URL
      const requestUrl = request.url || '';
      const requestHost = request.headers.get('host') || '';
      if (requestUrl.includes('localhost') || requestHost.includes('localhost')) {
        appUrl = `http://localhost:3000`;
        console.log(`[Cron] ✅ Detected local development (host: ${requestHost}), using: ${appUrl}`);
      } else {
        appUrl = 'https://ai-agent-iota-pearl.vercel.app';
        console.warn(`[Cron] ⚠️ Using hardcoded production URL as fallback: ${appUrl}`);
      }
    }
    
    // Ensure URL has protocol
    if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
      appUrl = `https://${appUrl}`;
    }
    
    // Final validation - reject any preview URLs
    if (appUrl.match(/-[a-z0-9]+-gordons-projects/)) {
      console.error(`[Cron] ❌ CRITICAL: Detected preview URL, forcing production URL`);
      appUrl = 'https://ai-agent-iota-pearl.vercel.app';
    }
    
    const internalApiKey = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET || '';
    
    if (!internalApiKey) {
      console.warn(`[Cron] ⚠️ WARNING: INTERNAL_API_KEY or CRON_SECRET not set! Tick endpoint may reject internal calls.`);
    }
    
    console.log(`[Cron] ✅ Using app URL: ${appUrl} (Internal API Key: ${internalApiKey ? 'SET' : 'NOT SET'})`);
    
    // Final validation - ensure we're not using a preview URL
    if (appUrl.match(/-[a-z0-9]+-gordons-projects/)) {
      console.error(`[Cron] ❌ CRITICAL ERROR: Still using preview URL: ${appUrl}`);
      console.error(`[Cron] ❌ This will cause 401 errors. Please check NEXT_PUBLIC_APP_URL environment variable.`);
    }

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
      
      // Log what we found in the database
      console.log(`[Cron] 📊 Session ${session.id} cadence check:`, {
        strategyId,
        strategyFiltersCadence: strategyFilters.cadenceSeconds,
        sessionCadence: session.cadence_seconds,
        strategyFiltersKeys: Object.keys(strategyFilters),
        cadenceSecondsRaw: cadenceSeconds,
        cadenceSecondsType: typeof cadenceSeconds,
      });
      
      // CRITICAL FIX: Only fall back to session cadence if strategy filters has NO cadence
      // Otherwise, always use strategy filters (even if it differs from session)
      // This ensures edits to strategy cadence take effect immediately
      if (!cadenceSeconds || cadenceSeconds <= 0 || !Number.isInteger(Number(cadenceSeconds))) {
        cadenceSeconds = session.cadence_seconds || 30;
        console.warn(`[Cron] ⚠️ Session ${session.id} has no valid cadence in strategy filters, using session.cadence_seconds: ${cadenceSeconds}s`);
      } else {
        // Strategy has cadence - use it (ignore session.cadence_seconds which may be outdated)
        if (session.cadence_seconds && session.cadence_seconds !== cadenceSeconds) {
          console.log(`[Cron] ℹ️ Session ${session.id} strategy cadence (${cadenceSeconds}s) differs from session cadence (${session.cadence_seconds}s) - using strategy cadence`);
        }
      }
      cadenceSeconds = Number(cadenceSeconds); // Convert to number explicitly
      
      if (isNaN(cadenceSeconds) || cadenceSeconds <= 0) {
        console.warn(`[Cron] ⚠️ Session ${session.id} has invalid cadence (${cadenceSeconds}), using default 30s`);
        cadenceSeconds = 30;
      }
      
      console.log(`[Cron] ✅ Session ${session.id} using cadence: ${cadenceSeconds}s (source: ${cadenceSource})`);
      
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
        // ALWAYS log detailed info to diagnose cadence issues
        console.log(`[Cron] ✅ Session ${session.id} needs ticking:`, {
          cadenceSeconds,
          cadenceMs,
          lastTickAt: session.last_tick_at,
          lastTickAtTimestamp: lastTickAt,
          now: new Date().toISOString(),
          nowTimestamp: now,
          timeSinceLastTick,
          timeSinceLastTickSeconds,
          deltaSeconds: delaySeconds,
          willTick: true,
          threshold: `>= ${cadenceMs}ms`,
        });
        console.log(`[Cron] ✅ Session ${session.id} needs ticking: ${timeSinceLastTickSeconds}s since last tick, cadence: ${cadenceSeconds}s${delaySeconds > 0 ? ` (${delaySeconds}s late)` : ''}`);
      } else {
        const nextTickInSeconds = Math.ceil((cadenceMs - timeSinceLastTick) / 1000);
        // ALWAYS log detailed info to diagnose cadence issues
        console.log(`[Cron] ⏭️ Session ${session.id} skipping:`, {
          cadenceSeconds,
          cadenceMs,
          lastTickAt: session.last_tick_at,
          lastTickAtTimestamp: lastTickAt,
          now: new Date().toISOString(),
          nowTimestamp: now,
          timeSinceLastTick,
          timeSinceLastTickSeconds,
          deltaSeconds: cadenceSeconds - timeSinceLastTickSeconds,
          willTick: false,
          threshold: `>= ${cadenceMs}ms`,
        });
        console.log(`[Cron] ⏭️ Session ${session.id} skipping: ${timeSinceLastTickSeconds}s since last tick, cadence: ${cadenceSeconds}s, next tick in ${nextTickInSeconds}s`);
      }
      
      return shouldTick;
    });

    // Process remaining sessions that don't need ticking yet
    const sessionsToSkip = runningSessions.filter((session) => {
      const strategy = Array.isArray(session.strategies) ? session.strategies[0] : session.strategies;
      const strategyFilters = (strategy as any)?.filters || {};
      let cadenceSeconds = strategyFilters.cadenceSeconds;
      if (!cadenceSeconds || cadenceSeconds <= 0) {
        cadenceSeconds = session.cadence_seconds || 30;
      }
      cadenceSeconds = Number(cadenceSeconds); // Convert to number explicitly
      
      if (isNaN(cadenceSeconds) || cadenceSeconds <= 0) {
        cadenceSeconds = 30;
      }
      
      const cadenceMs = cadenceSeconds * 1000;

      const lastTickAt = session.last_tick_at 
        ? new Date(session.last_tick_at).getTime() 
        : session.started_at 
        ? new Date(session.started_at).getTime() 
        : now;

      const timeSinceLastTick = now - lastTickAt;
      return timeSinceLastTick < cadenceMs;
    });

    sessionsToSkip.forEach((session) => {
      const strategy = Array.isArray(session.strategies) ? session.strategies[0] : session.strategies;
      const strategyFilters = (strategy as any)?.filters || {};
      let cadenceSeconds = strategyFilters.cadenceSeconds;
      if (!cadenceSeconds || cadenceSeconds <= 0) {
        cadenceSeconds = session.cadence_seconds || 30;
      }
      cadenceSeconds = Number(cadenceSeconds);
      const cadenceMs = cadenceSeconds * 1000;
      
      const lastTickAt = session.last_tick_at 
        ? new Date(session.last_tick_at).getTime() 
        : session.started_at 
        ? new Date(session.started_at).getTime() 
        : 0;
      const timeSinceLastTick = lastTickAt > 0 ? Math.floor((now - lastTickAt) / 1000) : 0;
      const timeUntilNextTick = Math.max(0, cadenceMs - (now - lastTickAt));
      console.log(`[Cron] ⏭️ Skipping session ${session.id}: ${timeSinceLastTick}s since last tick, need ${cadenceSeconds}s (${Math.floor(timeUntilNextTick / 1000)}s until next tick)`);
      skipped.push(`${session.id} (${timeSinceLastTick}s since last tick, need ${cadenceSeconds}s, next tick in ${Math.floor(timeUntilNextTick / 1000)}s)`);
    });

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
              console.log(`[Cron] Sending X-Internal-API-Key header (first 8 chars: ${internalApiKey.substring(0, 8)}...)`);
            } else {
              console.error(`[Cron] ❌ CRITICAL: No internal API key set! INTERNAL_API_KEY and CRON_SECRET are both missing.`);
              console.error(`[Cron] ❌ This will cause 401 errors. Please set INTERNAL_API_KEY in Vercel environment variables.`);
            }
            
            const tickResponse = await fetch(tickUrl, {
              method: "POST",
              headers,
              // Set a timeout to prevent hanging
              signal: AbortSignal.timeout(30000), // 30 second timeout
            });

            if (tickResponse.ok) {
              processed.push(session.id);
              console.log(`[Cron] ✅ Successfully ticked session ${session.id}`);
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

    return NextResponse.json({
      message: "Cron job completed",
      total: runningSessions.length,
      processed: processed.length,
      skipped: skipped.length,
      processedSessions: processed,
      skippedSessions: skipped,
    });
  } catch (error: any) {
    console.error("[Cron] Fatal error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
