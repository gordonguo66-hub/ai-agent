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

    // Start cron scheduler on Railway (long-running server only)
    // Vercel is serverless so this won't persist there — that's fine,
    // Vercel only handles update-peaks via vercel.json cron.
    if (process.env.RAILWAY_ENVIRONMENT) {
      const { startTickCron } = await import("./lib/cron/tickScheduler");
      startTickCron();
    }
  }
}
