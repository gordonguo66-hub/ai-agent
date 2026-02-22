import { NextRequest, NextResponse } from "next/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";

// CRITICAL: Next.js 14 caches fetch() by default. force-dynamic alone does NOT prevent
// the Supabase client's internal fetch() from being cached in the data cache.
// We also use createFreshServiceClient (with Cache-Control: no-cache headers) to ensure
// the last_tick_at query always returns fresh data from Postgres.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

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

  // Diagnostic: log platform API key presence immediately (helps debug "No API key configured" errors)
  const keyNames = ['PLATFORM_OPENAI_API_KEY', 'PLATFORM_ANTHROPIC_API_KEY', 'PLATFORM_DEEPSEEK_API_KEY', 'PLATFORM_GOOGLE_API_KEY', 'PLATFORM_XAI_API_KEY', 'PLATFORM_QWEN_API_KEY'];
  const keyStatus = keyNames.map(k => `${k}=${process.env[k] ? `✅(${process.env[k]!.length}ch)` : '❌MISSING'}`).join(' | ');
  console.log(`[Cron] 🔑 Platform keys: ${keyStatus}`);

  try {
    const serviceClient = createFreshServiceClient();
    
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
    const lockSkipped: string[] = [];
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

    // DISPATCH ALL running sessions — cadence deduplication is handled by
    // acquire_tick_lock() in the per-session tick handler (PostgreSQL function).
    // Previously, this route pre-filtered by cadence using last_tick_at from
    // the Supabase REST API, but Next.js fetch caching caused stale reads,
    // permanently blocking all sessions with "6s/60s" cadence-skipped.
    // The PG function reads last_tick_at directly — immune to HTTP caching.
    const sessionsToTick = runningSessions;

    console.log(`[Cron] Dispatching ALL ${sessionsToTick.length} running sessions (lock dedup in PG)`);

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
              signal: AbortSignal.timeout(120000), // 120s — let Vercel's 60s function timeout manage lifecycle
            });

            if (tickResponse.ok) {
              // Check if the tick was actually executed or just lock-skipped
              let tickBody: any = {};
              try { tickBody = await tickResponse.clone().json(); } catch {}
              if (tickBody.skipped && tickBody.reason === 'tick_lock_failed') {
                // Lock failed — session was ticked recently by another source
                const lockSkipMsg = `${session.id.slice(0, 8)} (lock: minInterval=${tickBody.minIntervalMs}ms)`;
                lockSkipped.push(lockSkipMsg);
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

    // Build debug info for lock-skipped sessions (deduped by PG lock)
    const cadenceDebug = lockSkipped;

    // Diagnostic: check platform API key availability (shows in Railway logs)
    const platformKeyDiag = ['openai', 'anthropic', 'deepseek', 'google', 'xai', 'qwen']
      .map(p => {
        const envVar = `PLATFORM_${p.toUpperCase()}_API_KEY`;
        const val = process.env[envVar];
        return `${p}=${val ? `set(${val.length}ch)` : 'MISSING'}`;
      })
      .join(', ');

    return NextResponse.json({
      message: "Cron job completed",
      total: runningSessions.length,
      processed: processed.length,
      lockSkipped: lockSkipped.length,
      skipped: skipped.length,
      processedSessions: processed,
      lockSkippedSessions: lockSkipped,
      skippedSessions: skipped,
      cadenceSkipped: cadenceDebug,
      platformKeys: platformKeyDiag,
    });
  } catch (error: any) {
    console.error("[Cron] Fatal error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
