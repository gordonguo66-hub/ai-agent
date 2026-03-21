/**
 * Builds a rich analysis context for the Backtest Analysis Chat.
 * Fetches trades, strategy config, and candle windows around each trade,
 * then structures it into a system prompt the AI can use to analyze the backtest.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchHistoricalCandles, RESOLUTION_MS } from "./engine";
import { calculateIndicators } from "@/lib/indicators/calculations";

interface TradeRecord {
  id: string;
  market: string;
  action: string;
  side: string;
  size: number;
  price: number;
  fee: number;
  realized_pnl: number;
  tick_index: number;
  tick_timestamp: string;
  reasoning: string;
}

interface AnalysisContext {
  systemPrompt: string;
  backtestId: string;
  model: string;
  modelProvider: string;
  strategyId: string;
}

export async function buildAnalysisContext(
  backtestId: string,
  userId: string
): Promise<AnalysisContext> {
  const supabase = createServiceRoleClient();

  // 1. Load backtest run
  const { data: run } = await supabase
    .from("backtest_runs")
    .select("*")
    .eq("id", backtestId)
    .eq("user_id", userId)
    .single();

  if (!run) throw new Error("Backtest not found");
  if (run.status !== "completed") throw new Error("Backtest must be completed");

  // 2. Load strategy config
  const { data: strategy } = await supabase
    .from("strategies")
    .select("id, name, prompt, model_provider, model_name, filters")
    .eq("id", run.strategy_id)
    .single();

  if (!strategy) throw new Error("Strategy not found");

  // 3. Load all trades
  const { data: trades } = await supabase
    .from("backtest_trades")
    .select("*")
    .eq("backtest_id", backtestId)
    .order("tick_index", { ascending: true });

  const allTrades: TradeRecord[] = (trades || []).map((t: any) => ({
    ...t,
    size: Number(t.size),
    price: Number(t.price),
    fee: Number(t.fee),
    realized_pnl: Number(t.realized_pnl),
    tick_index: Number(t.tick_index),
  }));

  // 4. Pair entry/exit trades
  const tradePairs = pairTrades(allTrades);

  // 5. Fetch candle windows for each trade pair
  const resolution = run.resolution || "1h";
  const resolutionMs = RESOLUTION_MS[resolution] || 3600000;
  const venue = run.venue || "hyperliquid";
  const markets = run.markets || [];

  // Fetch candles for the full period + buffer
  const startMs = new Date(run.start_date).getTime() - 24 * resolutionMs;
  const endMs = new Date(run.end_date).getTime() + 12 * resolutionMs;

  const candlesByMarket: Record<string, any[]> = {};
  for (const market of markets) {
    try {
      const candles = await fetchHistoricalCandles(market, venue, startMs, endMs, resolution);
      candlesByMarket[market] = candles;
    } catch {
      candlesByMarket[market] = [];
    }
  }

  // 6. Build trade context with candle windows + indicators
  const tradeContexts = tradePairs.map((pair, i) => {
    return buildTradeContext(pair, i + 1, candlesByMarket, resolutionMs);
  });

  // 7. Build the system prompt
  const filters = strategy.filters || {};
  const entryExit = filters.entryExit || {};
  const exitConfig = entryExit.exit || {};
  const entryConfig = entryExit.entry || {};
  const risk = filters.risk || {};
  const aiInputs = filters.aiInputs || {};
  const summary = run.result_summary || {};

  const systemPrompt = `You are an expert trading strategy analyst. You have complete access to a backtest and all its market data. Your job is to analyze trades, identify patterns, and suggest improvements to the strategy.

## Backtest Overview
- Period: ${run.start_date?.slice(0, 10)} to ${run.end_date?.slice(0, 10)}
- Resolution: ${resolution}
- Markets: ${markets.join(", ")}
- Model: ${run.model_provider}/${run.model_name}
- Starting Equity: $${Number(run.starting_equity || 100000).toLocaleString()}
- Venue: ${venue}

## Performance Summary
- Return: ${summary.return_pct?.toFixed(2) ?? "?"}%
- Final Equity: $${summary.final_equity?.toFixed(2) ?? "?"}
- Total PnL: $${summary.total_pnl?.toFixed(2) ?? "?"}
- Win Rate: ${summary.win_rate?.toFixed(1) ?? "?"}%
- Max Drawdown: ${summary.max_drawdown_pct?.toFixed(2) ?? "?"}%
- Total Trades: ${summary.total_trades ?? "?"}
- Winners: ${summary.winning_trades ?? "?"}, Losers: ${summary.losing_trades ?? "?"}
- Avg Trade PnL: $${summary.avg_trade_pnl?.toFixed(2) ?? "?"}

## Strategy Configuration
### Prompt
${strategy.prompt || "(no prompt)"}

### Entry Rules
- Mode: ${entryConfig.mode || "signal"}
- Behaviors: ${JSON.stringify(entryConfig.behaviors || {})}
- Min Confidence: ${entryExit.confidenceControl?.minConfidence ?? "0.5"}
- Confidence Scaling: ${entryExit.confidenceControl?.confidenceScaling ? "enabled" : "disabled"}

### Exit Rules
- Mode: ${exitConfig.mode || "signal"}
- Stop Loss: ${exitConfig.stopLossPct != null ? exitConfig.stopLossPct + "%" : "none"}
- Take Profit: ${exitConfig.takeProfitPct != null ? exitConfig.takeProfitPct + "%" : "none"}
- Trailing Stop: ${exitConfig.trailingStopPct != null ? exitConfig.trailingStopPct + "%" : "none"}
- Max Hold: ${exitConfig.maxHoldMinutes != null ? exitConfig.maxHoldMinutes + " min" : "none"}

### Risk Filters
- Max Position: $${risk.maxPositionUsd ?? "?"}
- Max Leverage: ${risk.maxLeverage ?? "?"}x
- Max Daily Loss: ${risk.maxDailyLossPct ?? "?"}%

### Trade Control
- Max Trades/Hour: ${entryExit.tradeControl?.maxTradesPerHour ?? "?"}
- Max Trades/Day: ${entryExit.tradeControl?.maxTradesPerDay ?? "?"}
- Cooldown: ${entryExit.tradeControl?.cooldownMinutes ?? "?"} min
- Min Hold: ${entryExit.tradeControl?.minHoldMinutes ?? "?"} min

### AI Inputs Enabled
${formatAiInputs(aiInputs)}

## Trade Log with Market Context
${tradeContexts.join("\n\n")}

## Instructions
- When analyzing trades, reference specific prices, indicators, and candle patterns
- When suggesting improvements, be specific about which parameters to change and why
- If the user asks about a specific trade number, provide detailed analysis of that trade's entry setup, hold period, and exit
- Consider whether losses were due to bad entries, bad exits (SL too tight/loose), or market conditions
- Look for patterns across winning vs losing trades
- Suggest prompt improvements, exit parameter changes, or entry behavior adjustments based on the data`;

  return {
    systemPrompt,
    backtestId,
    model: run.model_name,
    modelProvider: run.model_provider,
    strategyId: strategy.id,
  };
}

interface TradePair {
  entry: TradeRecord;
  exit: TradeRecord | null;
  pnl: number;
}

function pairTrades(trades: TradeRecord[]): TradePair[] {
  const pairs: TradePair[] = [];
  const openByMarket = new Map<string, TradeRecord>();

  for (const t of trades) {
    if (t.action === "open") {
      openByMarket.set(t.market, t);
    } else if (t.action === "close" || t.action === "flip") {
      const entry = openByMarket.get(t.market);
      if (entry) {
        pairs.push({ entry, exit: t, pnl: t.realized_pnl });
        openByMarket.delete(t.market);
      }
    }
  }

  // Any remaining open positions (force-closed at end)
  for (const [, entry] of openByMarket) {
    pairs.push({ entry, exit: null, pnl: 0 });
  }

  return pairs;
}

function buildTradeContext(
  pair: TradePair,
  tradeNum: number,
  candlesByMarket: Record<string, any[]>,
  resolutionMs: number
): string {
  const { entry, exit, pnl } = pair;
  const candles = candlesByMarket[entry.market] || [];

  const entryTime = new Date(entry.tick_timestamp).getTime();
  const exitTime = exit ? new Date(exit.tick_timestamp).getTime() : entryTime + 24 * 3600000;

  // Find candle indices
  const entryIdx = candles.findIndex((c: any) => Math.abs(c.t - entryTime) < resolutionMs);
  const exitIdx = exit ? candles.findIndex((c: any) => Math.abs(c.t - exitTime) < resolutionMs) : -1;

  // Candles before entry (setup)
  const beforeStart = Math.max(0, entryIdx - 12);
  const beforeCandles = entryIdx >= 0 ? candles.slice(beforeStart, entryIdx + 1) : [];

  // Candles during hold
  const holdCandles = (entryIdx >= 0 && exitIdx >= 0)
    ? candles.slice(entryIdx, exitIdx + 1)
    : [];

  // Candles after exit
  const afterCandles = exitIdx >= 0
    ? candles.slice(exitIdx, Math.min(candles.length, exitIdx + 7))
    : [];

  // Compute indicators at entry
  const indicatorCandles = entryIdx >= 0 ? candles.slice(Math.max(0, entryIdx - 50), entryIdx + 1) : [];
  let indicators = "";
  if (indicatorCandles.length > 10) {
    try {
      const formatted = indicatorCandles.map((c: any) => ({
        t: c.t, T: c.t + resolutionMs, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, n: 0,
      }));
      const ind = calculateIndicators(formatted, {
        rsi: { enabled: true, period: 14 },
        ema: { enabled: true, fast: 12, slow: 26 },
        macd: { enabled: true },
        bollingerBands: { enabled: true },
        atr: { enabled: true },
        supportResistance: { enabled: true, lookback: 50 },
      });
      indicators = formatIndicators(ind);
    } catch {}
  }

  const result = pnl >= 0 ? "WIN" : "LOSS";
  const holdHours = exit ? ((exitTime - entryTime) / 3600000).toFixed(1) : "?";

  let text = `### Trade #${tradeNum} — ${result} ${exit ? `$${pnl.toFixed(2)}` : "(still open)"}
- Market: ${entry.market}
- Entry: ${entry.side.toUpperCase()} @ $${entry.price.toFixed(2)} on ${entry.tick_timestamp}
- Size: ${entry.size.toFixed(6)} (notional: $${(entry.price * entry.size).toFixed(2)})`;

  if (exit) {
    text += `
- Exit: ${exit.side.toUpperCase()} @ $${exit.price.toFixed(2)} on ${exit.tick_timestamp}
- Exit Reason: ${exit.reasoning}
- Hold Time: ${holdHours}h
- PnL: $${pnl.toFixed(2)} (${((pnl / (entry.price * entry.size)) * 100).toFixed(2)}%)`;
  }

  text += `
- AI Entry Reasoning: ${entry.reasoning}`;

  if (indicators) {
    text += `
- Indicators at Entry: ${indicators}`;
  }

  if (beforeCandles.length > 0) {
    text += `
- Setup (${beforeCandles.length} candles before entry):
${formatCandleWindow(beforeCandles)}`;
  }

  if (holdCandles.length > 2) {
    text += `
- During Hold (${holdCandles.length} candles):
${formatCandleWindow(holdCandles)}`;
  }

  if (afterCandles.length > 1) {
    text += `
- After Exit (${afterCandles.length} candles):
${formatCandleWindow(afterCandles)}`;
  }

  return text;
}

function formatCandleWindow(candles: any[]): string {
  return candles.map((c: any) => {
    const d = new Date(c.t);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:00`;
    return `  ${dateStr} | O:${c.o.toFixed(2)} H:${c.h.toFixed(2)} L:${c.l.toFixed(2)} C:${c.c.toFixed(2)} V:${Math.round(c.v)}`;
  }).join("\n");
}

function formatIndicators(ind: Record<string, any>): string {
  const parts: string[] = [];
  if (ind.rsi) parts.push(`RSI=${ind.rsi.value.toFixed(1)}`);
  if (ind.ema) parts.push(`EMA12=${ind.ema.fast.toFixed(2)} EMA26=${ind.ema.slow.toFixed(2)}`);
  if (ind.macd) parts.push(`MACD=${ind.macd.histogram.toFixed(4)} line=${ind.macd.macd.toFixed(4)}`);
  if (ind.bollingerBands) parts.push(`BB upper=${ind.bollingerBands.upper.toFixed(2)} lower=${ind.bollingerBands.lower.toFixed(2)}`);
  if (ind.atr) parts.push(`ATR=${ind.atr.value.toFixed(4)}`);
  if (ind.supportResistance) {
    const sr = ind.supportResistance;
    if (sr.support) parts.push(`Support=$${sr.support.toFixed(2)}`);
    if (sr.resistance) parts.push(`Resistance=$${sr.resistance.toFixed(2)}`);
  }
  return parts.join(", ");
}

function formatAiInputs(aiInputs: any): string {
  const lines: string[] = [];
  if (aiInputs.candles?.enabled) lines.push(`- Candles: ${aiInputs.candles.count || 200} @ ${aiInputs.candles.timeframe || "primary"}`);
  if (aiInputs.indicators) {
    const enabled = Object.entries(aiInputs.indicators)
      .filter(([, v]: any) => v?.enabled)
      .map(([k]) => k);
    if (enabled.length > 0) lines.push(`- Indicators: ${enabled.join(", ")}`);
  }
  if (aiInputs.includePositionState !== false) lines.push("- Position state: included");
  if (aiInputs.includeRecentDecisions !== false) lines.push(`- Recent decisions: ${aiInputs.recentDecisionsCount || 5}`);
  if (aiInputs.includeRecentTrades !== false) lines.push(`- Recent trades: ${aiInputs.recentTradesCount || 10}`);
  return lines.length > 0 ? lines.join("\n") : "- Default inputs";
}
