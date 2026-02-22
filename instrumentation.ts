/**
 * Next.js Instrumentation
 * Runs once when the server starts
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Auto-setup encryption key (dev) or check it's configured (production)
    const { ensureEncryptionKey } = await import("./lib/crypto/autoSetup");
    ensureEncryptionKey();

    // NOTE: tick-all-sessions is handled by the dedicated Railway tick-worker
    // (worker/tick-worker.js). The old tickScheduler was removed because having
    // both caused lock-skip races (processed: 6, skipped: 6 pattern).
  }
}
