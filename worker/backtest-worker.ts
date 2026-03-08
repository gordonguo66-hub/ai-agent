/**
 * Railway Backtest Worker
 *
 * Polls Supabase for pending backtest runs and executes them as long-running
 * Node.js processes — no Vercel timeout limits.
 *
 * Environment variables required (same as Vercel):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - PLATFORM_OPENAI_API_KEY, PLATFORM_XAI_API_KEY, etc.
 */

import { createServiceRoleClient } from "../lib/supabase/server";
import { runBacktest, type BacktestConfig } from "../lib/backtest/engine";

const MAX_CONCURRENT = 3;
const POLL_INTERVAL_MS = 15 * 1000; // 15 seconds

// Track which backtests this worker process is currently running
const activeBacktests = new Set<string>();

/**
 * On startup, any backtest stuck in "running" state is orphaned
 * (was running on Vercel or a crashed worker). Reset them to "pending"
 * so this worker picks them up fresh.
 */
async function resetOrphanedBacktests() {
  const supabase = createServiceRoleClient();

  const { data: orphaned } = await supabase
    .from("backtest_runs")
    .select("id")
    .eq("status", "running");

  if (!orphaned || orphaned.length === 0) return;

  console.log(
    `[Backtest Worker] Found ${orphaned.length} orphaned running backtest(s) — resetting to pending`
  );

  for (const run of orphaned) {
    await supabase
      .from("backtest_runs")
      .update({ status: "pending", completed_ticks: 0, actual_cost_cents: 0 })
      .eq("id", run.id);
  }
}

/**
 * Pick up pending backtests and start running them.
 */
async function pollAndRun() {
  const slots = MAX_CONCURRENT - activeBacktests.size;
  if (slots <= 0) return;

  const supabase = createServiceRoleClient();

  const { data: pending } = await supabase
    .from("backtest_runs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(slots);

  if (!pending || pending.length === 0) return;

  for (const run of pending) {
    if (activeBacktests.size >= MAX_CONCURRENT) break;
    if (activeBacktests.has(run.id)) continue;

    // Load strategy for prompt + filters (snapshot at start time)
    const { data: strategy } = await supabase
      .from("strategies")
      .select("prompt, filters, model_provider, model_name")
      .eq("id", run.strategy_id)
      .single();

    if (!strategy) {
      console.error(
        `[Backtest Worker] Strategy not found for backtest ${run.id} — marking failed`
      );
      await supabase
        .from("backtest_runs")
        .update({ status: "failed", error_message: "Strategy not found" })
        .eq("id", run.id);
      continue;
    }

    const config: BacktestConfig = {
      backtestId: run.id,
      userId: run.user_id,
      strategyId: run.strategy_id,
      markets: run.markets || [],
      venue: run.venue || "hyperliquid",
      startDate: new Date(run.start_date),
      endDate: new Date(run.end_date),
      resolution: run.resolution || "1h",
      modelProvider: run.model_provider || strategy.model_provider,
      modelName: run.model_name || strategy.model_name,
      startingEquity: Number(run.starting_equity) || 100000,
      strategyPrompt: strategy.prompt || "",
      strategyFilters: strategy.filters || {},
    };

    activeBacktests.add(run.id);
    console.log(
      `[Backtest Worker] Starting ${run.id} | ${(run.markets || []).join(",")} | ${run.resolution} | ${config.modelProvider}/${config.modelName} | Active: ${activeBacktests.size}/${MAX_CONCURRENT}`
    );

    runBacktest(config)
      .then(() =>
        console.log(`[Backtest Worker] Completed ${run.id} | Active: ${activeBacktests.size - 1}/${MAX_CONCURRENT}`)
      )
      .catch((err) =>
        console.error(`[Backtest Worker] Error in ${run.id}:`, err?.message || err)
      )
      .finally(() => activeBacktests.delete(run.id));
  }
}

async function main() {
  console.log("[Backtest Worker] ========================================");
  console.log("[Backtest Worker] Starting");
  console.log(`[Backtest Worker] Max concurrent: ${MAX_CONCURRENT}`);
  console.log(`[Backtest Worker] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(
    `[Backtest Worker] Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "MISSING"}`
  );
  console.log(
    `[Backtest Worker] Service role key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING"}`
  );
  console.log("[Backtest Worker] ========================================");

  // Reset any backtests orphaned from previous Vercel runs
  await resetOrphanedBacktests();

  // Main poll loop
  while (true) {
    try {
      await pollAndRun();
    } catch (err: any) {
      console.error("[Backtest Worker] Poll error:", err?.message || err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

process.on("SIGTERM", () => {
  console.log(`[Backtest Worker] SIGTERM — active backtests: ${activeBacktests.size}`);
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log(`[Backtest Worker] SIGINT — active backtests: ${activeBacktests.size}`);
  process.exit(0);
});

main().catch((err) => {
  console.error("[Backtest Worker] Fatal error:", err);
  process.exit(1);
});
