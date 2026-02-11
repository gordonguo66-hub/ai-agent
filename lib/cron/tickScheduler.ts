/**
 * Cron scheduler for tick-all-sessions
 * Only runs on Railway (long-running server).
 * Calls the local tick-all-sessions endpoint every 60 seconds.
 */

let started = false;

export function startTickCron() {
  if (started) return;
  started = true;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const apiKey = process.env.INTERNAL_API_KEY;

  if (!apiKey) {
    console.error("[TickCron] INTERNAL_API_KEY not set — skipping cron setup");
    return;
  }

  const endpoint = `${appUrl}/api/cron/tick-all-sessions`;
  console.log(`[TickCron] Started — calling ${endpoint} every 60s`);

  setInterval(async () => {
    const ts = new Date().toISOString();
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await res.text();
      if (res.ok) {
        console.log(`[TickCron ${ts}] OK (${res.status}): ${body.slice(0, 200)}`);
      } else {
        console.error(`[TickCron ${ts}] FAILED (${res.status}): ${body.slice(0, 300)}`);
      }
    } catch (err: any) {
      console.error(`[TickCron ${ts}] ERROR:`, err.message);
    }
  }, 60_000);
}
