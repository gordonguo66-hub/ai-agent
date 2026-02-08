/**
 * Railway Worker - Tick All Sessions
 *
 * This worker runs continuously and calls the tick-all-sessions endpoint
 * every 60 seconds. It replaces the Vercel cron for scaling beyond 50 users.
 *
 * The worker does NOT contain any tick logic - it simply calls the existing
 * endpoint which handles everything. This ensures zero platform changes.
 *
 * Environment variables required:
 * - NEXT_PUBLIC_APP_URL: Your Vercel app URL (e.g., https://ai-agent-iota-pearl.vercel.app)
 * - INTERNAL_API_KEY: Same API key used in Vercel for authentication
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const API_KEY = process.env.INTERNAL_API_KEY;

// Validate environment variables
if (!APP_URL) {
  console.error('[Worker] ERROR: NEXT_PUBLIC_APP_URL environment variable is required');
  process.exit(1);
}

if (!API_KEY) {
  console.error('[Worker] ERROR: INTERNAL_API_KEY environment variable is required');
  process.exit(1);
}

// Tick interval in milliseconds (60 seconds)
const TICK_INTERVAL_MS = 60 * 1000;

// Track stats
let tickCount = 0;
let successCount = 0;
let failCount = 0;

/**
 * Call the tick-all-sessions endpoint
 */
async function tick() {
  tickCount++;
  const startTime = Date.now();

  try {
    console.log(`[Worker] Starting tick #${tickCount} at ${new Date().toISOString()}`);

    const response = await fetch(`${APP_URL}/api/cron/tick-all-sessions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const duration = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      successCount++;
      console.log(`[Worker] Tick #${tickCount} complete in ${duration}ms:`, {
        processed: data.processed || 0,
        skipped: data.skipped || 0,
        total: data.total || 0,
      });
    } else {
      failCount++;
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[Worker] Tick #${tickCount} failed (${response.status}) in ${duration}ms:`, errorText);
    }
  } catch (error) {
    failCount++;
    const duration = Date.now() - startTime;
    console.error(`[Worker] Tick #${tickCount} error in ${duration}ms:`, error.message);
  }

  // Log stats every 10 ticks
  if (tickCount % 10 === 0) {
    console.log(`[Worker] Stats: ${successCount} success, ${failCount} failed, ${tickCount} total`);
  }
}

/**
 * Graceful shutdown handler
 */
function shutdown(signal) {
  console.log(`[Worker] Received ${signal}, shutting down gracefully...`);
  console.log(`[Worker] Final stats: ${successCount} success, ${failCount} failed, ${tickCount} total`);
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the worker
console.log('[Worker] ========================================');
console.log('[Worker] Tick Worker Started');
console.log('[Worker] ========================================');
console.log(`[Worker] App URL: ${APP_URL}`);
console.log(`[Worker] API Key: ${API_KEY.substring(0, 8)}...`);
console.log(`[Worker] Tick interval: ${TICK_INTERVAL_MS / 1000} seconds`);
console.log('[Worker] ========================================');

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main tick loop - waits for each tick to complete before scheduling next
 * This prevents overlapping ticks when processing takes longer than the interval
 */
async function runTickLoop() {
  while (true) {
    const tickStartTime = Date.now();
    await tick();
    const tickDuration = Date.now() - tickStartTime;

    // Wait for remainder of interval, or start immediately if tick took longer
    const waitTime = Math.max(0, TICK_INTERVAL_MS - tickDuration);
    if (waitTime > 0) {
      await sleep(waitTime);
    } else {
      console.log(`[Worker] ⚠️ Tick took ${tickDuration}ms (longer than ${TICK_INTERVAL_MS}ms interval), starting next tick immediately`);
    }
  }
}

// Start the tick loop
runTickLoop().catch(err => {
  console.error('[Worker] Fatal error in tick loop:', err);
  process.exit(1);
});

// Keep the process alive
console.log('[Worker] Worker is running. Press Ctrl+C to stop.');
