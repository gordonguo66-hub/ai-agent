import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCandles as getHyperliquidCandles, type Candle } from "@/lib/hyperliquid/candles";
import { getCandles as getCoinbaseCandles, getHistoricalCandles as getCoinbaseHistoricalCandles, toCoinbaseProductId } from "@/lib/coinbase/candles";
import { calculateIndicators } from "@/lib/indicators/calculations";
import { openAICompatibleIntentCall, type IntentWithUsage } from "@/lib/ai/openaiCompatible";
import { resolveStrategyApiKey } from "@/lib/ai/resolveApiKey";
import { normalizeModelName } from "@/lib/ai/normalizeModel";
import { calculateCost, calculateChargedCents, getMarkupForTier } from "@/lib/pricing/apiCosts";
import { runMarketAnalysis } from "@/lib/ai/marketAnalysis";

export const FEE_BPS = 5;
export const SLIPPAGE_BPS = 10;

export const RESOLUTION_MS: Record<string, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

const RESOLUTION_TO_CANDLE_INTERVAL: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

const HTF_MAP: Record<string, string> = {
  "1m": "15m",
  "5m": "1h",
  "15m": "4h",
  "1h": "1d",
  "4h": "1d",
};

interface BacktestPosition {
  market: string;
  side: "long" | "short";
  size: number;
  avgEntry: number;
  leverage: number;
}

interface BacktestAccount {
  equity: number;
  cash: number;
  startingEquity: number;
  positions: Map<string, BacktestPosition>;
  peakEquity: number;
  maxDrawdownPct: number;
}

interface BacktestTradeRecord {
  market: string;
  action: "open" | "close" | "flip";
  side: "buy" | "sell";
  size: number;
  price: number;
  fee: number;
  realizedPnl: number;
  tickIndex: number;
  tickTimestamp: Date;
  reasoning: string;
}

interface BacktestDecisionRecord {
  tickIndex: number;
  market: string;
  tickTimestamp: Date;
  price: number;
  intent: any;
  confidence: number;
  reasoning: string;
  actionSummary: string;
  inputTokens: number;
  outputTokens: number;
}

export interface BacktestConfig {
  backtestId: string;
  userId: string;
  strategyId: string;
  markets: string[];
  venue: string;
  startDate: Date;
  endDate: Date;
  resolution: string;
  modelProvider?: string;
  modelName?: string;
  startingEquity: number;
  strategyPrompt: string;
  strategyFilters: any;
}

export async function fetchHistoricalCandles(
  market: string,
  venue: string,
  startTime: number,
  endTime: number,
  interval: string
): Promise<Candle[]> {
  const intervalMs = RESOLUTION_MS[interval] || 60 * 60 * 1000;
  const totalCandles = Math.ceil((endTime - startTime) / intervalMs);

  // For Coinbase venue, use Coinbase historical fetch directly
  if (venue === "coinbase") {
    const candles = await getCoinbaseHistoricalCandles(market, startTime, endTime, interval);
    console.log(`[Backtest] Fetched ${candles.length} candles from Coinbase for ${market} (expected ~${totalCandles})`);
    return candles;
  }

  // Hyperliquid venue: fetch in batches, fall back to Coinbase if no data
  const allCandles: Candle[] = [];
  let currentStart = startTime;
  const batchSize = 5000;
  let hyperliquidHasData = true;
  let coinbaseFallbackUsed = false;

  while (currentStart < endTime) {
    const batchEnd = Math.min(currentStart + batchSize * intervalMs, endTime);
    let batchCandles: Candle[] = [];

    // Try Hyperliquid first
    if (hyperliquidHasData) {
      for (let retryAttempt = 0; retryAttempt < 3; retryAttempt++) {
        try {
          const baseSymbol = market.replace("-PERP", "").replace("-SPOT", "");
          const response = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "candleSnapshot",
              req: {
                coin: baseSymbol,
                interval,
                startTime: currentStart,
                endTime: batchEnd,
              },
            }),
          });

          if (!response.ok) throw new Error(`Hyperliquid API error: ${response.status}`);
          const data = await response.json();
          const rawCandles = Array.isArray(data) ? data : [];
          batchCandles = rawCandles.map((c: any) => ({
            t: Number(c.t || 0),
            T: Number(c.T || 0),
            o: Number(c.o || 0),
            h: Number(c.h || 0),
            l: Number(c.l || 0),
            c: Number(c.c || 0),
            v: Number(c.v || 0),
            n: Number(c.n || 0),
          }));
          break;
        } catch (err) {
          console.error(`[Backtest] Failed to fetch candles batch (attempt ${retryAttempt + 1}/3): ${err}`);
          if (retryAttempt < 2) await new Promise(r => setTimeout(r, 1000 * (retryAttempt + 1)));
        }
      }
    }

    // If Hyperliquid returned 0 candles for this batch, fall back to Coinbase
    if (batchCandles.length === 0) {
      if (hyperliquidHasData) {
        console.log(`[Backtest] No Hyperliquid ${interval} data for ${market} at ${new Date(currentStart).toISOString()}, falling back to Coinbase`);
        hyperliquidHasData = false;
        coinbaseFallbackUsed = true;
      }
      try {
        const cbCandles = await getCoinbaseHistoricalCandles(market, currentStart, batchEnd, interval);
        batchCandles = cbCandles as unknown as Candle[];
      } catch (err) {
        console.error(`[Backtest] Coinbase fallback also failed for ${market}:`, err);
      }
    }

    batchCandles.sort((a, b) => a.t - b.t);
    for (const c of batchCandles) {
      if (c.t >= startTime && c.t < endTime) {
        allCandles.push(c);
      }
    }

    currentStart = batchEnd;
  }

  allCandles.sort((a, b) => a.t - b.t);

  const seen = new Set<number>();
  const deduped = allCandles.filter((c) => {
    if (seen.has(c.t)) return false;
    seen.add(c.t);
    return true;
  });

  const source = coinbaseFallbackUsed ? " (with Coinbase fallback)" : "";
  console.log(`[Backtest] Fetched ${deduped.length} candles for ${market}${source} (expected ~${totalCandles})`);
  return deduped;
}

function sliceCandles(candles: Candle[], upToIndex: number, count: number = 200): any[] {
  const slice = candles.slice(Math.max(0, upToIndex - (count - 1)), upToIndex + 1);
  return slice.map((c) => ({
    time: c.t,
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
    volume: c.v,
  }));
}

function simulateExecution(
  price: number,
  side: "buy" | "sell",
  sizeBase: number
): { fillPrice: number; fee: number } {
  const slippage = price * (SLIPPAGE_BPS / 10000);
  const fillPrice = side === "buy" ? price + slippage : price - slippage;
  const notional = fillPrice * sizeBase;
  const fee = notional * (FEE_BPS / 10000);
  return { fillPrice, fee };
}

function updateEquity(account: BacktestAccount, prices: Map<string, number>): number {
  let positionValue = 0;
  for (const [, pos] of account.positions) {
    const currentPrice = prices.get(pos.market) || pos.avgEntry;
    const notional = pos.avgEntry * pos.size;
    const pnl = pos.side === "long"
      ? (currentPrice - pos.avgEntry) * pos.size
      : (pos.avgEntry - currentPrice) * pos.size;
    positionValue += notional + pnl;
  }
  account.equity = account.cash + positionValue;

  if (account.equity > account.peakEquity) {
    account.peakEquity = account.equity;
  }
  const drawdown =
    account.peakEquity > 0
      ? ((account.peakEquity - account.equity) / account.peakEquity) * 100
      : 0;
  if (drawdown > account.maxDrawdownPct) {
    account.maxDrawdownPct = drawdown;
  }

  return account.equity;
}

function detectMarketType(
  market: string,
  venue: string,
): { marketType: "perpetual" | "spot"; maxLeverage: number; canShort: boolean } {
  const isPerps = market.includes("-PERP") || market.endsWith("-INTX") ||
    venue === "hyperliquid";
  const marketType = isPerps ? "perpetual" : "spot";
  return { marketType, maxLeverage: isPerps ? 10 : 1, canShort: isPerps };
}

function buildEntryInstructions(behaviors: { trend?: boolean; breakout?: boolean; meanReversion?: boolean }): string {
  const enabled: string[] = [];
  if (behaviors.trend) enabled.push("trend-following (price moving in clear trend direction)");
  if (behaviors.breakout) enabled.push("breakout (price breaking through key support/resistance levels)");
  if (behaviors.meanReversion) enabled.push("mean reversion (price deviating significantly from average)");

  if (enabled.length === 0) {
    return "No entry behaviors enabled. Do not enter any positions.";
  } else if (enabled.length === 3) {
    return "All entry types allowed. Use AI-driven analysis to identify the best entry opportunities.";
  }
  return `Only these entry types are allowed: ${enabled.join(", ")}. Focus your analysis on these patterns only.`;
}

function classifyEntryType(
  intent: any,
  currentPrice: number,
  indicatorsSnapshot: any,
  marketAnalysis: any,
): "trend" | "breakout" | "meanReversion" | "unknown" {
  let entryType: "trend" | "breakout" | "meanReversion" | "unknown" = "unknown";

  const htfKL = marketAnalysis?.htfKeyLevels;
  const volumeRatio = indicatorsSnapshot?.volume?.currentVolumeRatio;
  const hasVolumeData = volumeRatio !== undefined && volumeRatio !== null;

  if (htfKL) {
    const nearHTFSupport = htfKL.distanceToSupportPct < 0.5 || currentPrice < htfKL.nearestSupport;
    const nearHTFResistance = htfKL.distanceToResistancePct < 0.5 || currentPrice > htfKL.nearestResistance;
    const hasVolumeConfirmation = hasVolumeData ? volumeRatio > 1.3 : false;
    const priceBrokeThrough = currentPrice < htfKL.nearestSupport || currentPrice > htfKL.nearestResistance;

    if ((nearHTFSupport || nearHTFResistance) && (hasVolumeConfirmation || priceBrokeThrough)) {
      entryType = "breakout";
    }
  }

  if (entryType === "unknown") {
    const bb = indicatorsSnapshot?.bollingerBands;
    const rsi = indicatorsSnapshot?.rsi?.value;
    const zScore = bb?.zScore;

    if (zScore !== undefined) {
      const absZ = Math.abs(zScore);
      const rsiConfirms = rsi !== undefined && (rsi < 35 || rsi > 65);
      if (absZ >= 2.0 || (absZ >= 1.5 && rsiConfirms)) {
        entryType = "meanReversion";
      }
    } else if (rsi !== undefined && (rsi < 25 || rsi > 75)) {
      entryType = "meanReversion";
    }
  }

  if (marketAnalysis?.regime && entryType === "unknown") {
    const { regime, trendStrength } = marketAnalysis.regime;
    const htfAligned = marketAnalysis.multiTimeframe?.alignment === "aligned_bullish"
      || marketAnalysis.multiTimeframe?.alignment === "aligned_bearish";

    if (regime === "trending" && (trendStrength >= 40 || (trendStrength >= 25 && htfAligned))) {
      const bbBandwidth = indicatorsSnapshot?.bollingerBands?.bandwidth;
      if (bbBandwidth !== undefined && bbBandwidth > 5.0) {
        entryType = "breakout";
      } else {
        entryType = "trend";
      }
    }
  }

  if (entryType === "unknown") {
    const reasoning = (intent.reasoning || "").toLowerCase();
    if (reasoning.includes("breakout") || reasoning.includes("break out") || reasoning.includes("broke through") || reasoning.includes("broke above") || reasoning.includes("broke below")) {
      entryType = "breakout";
    } else if (reasoning.includes("trend") || reasoning.includes("momentum") || reasoning.includes("uptrend") || reasoning.includes("downtrend")) {
      const bbBw = indicatorsSnapshot?.bollingerBands?.bandwidth;
      entryType = (bbBw !== undefined && bbBw > 5.0) ? "breakout" : "trend";
    } else if (reasoning.includes("reversion") || reasoning.includes("oversold") || reasoning.includes("overbought") || reasoning.includes("mean")) {
      entryType = "meanReversion";
    }
  }

  return entryType;
}

export async function runBacktest(config: BacktestConfig): Promise<void> {
  const supabase = createServiceRoleClient();
  const trades: BacktestTradeRecord[] = [];
  const decisions: BacktestDecisionRecord[] = [];
  const equityPoints: { tickIndex: number; equity: number; cash: number; timestamp: Date }[] = [];

  let totalActualCostCents = 0;

  const account: BacktestAccount = {
    equity: config.startingEquity,
    cash: config.startingEquity,
    startingEquity: config.startingEquity,
    positions: new Map(),
    peakEquity: config.startingEquity,
    maxDrawdownPct: 0,
  };

  try {
    await supabase
      .from("backtest_runs")
      .update({ status: "running" })
      .eq("id", config.backtestId);

    const strategy = await loadStrategy(supabase, config.strategyId);
    const modelProvider = config.modelProvider || strategy.model_provider;
    const modelName = config.modelName || strategy.model_name;
    const normalizedModel = normalizeModelName(modelProvider, modelName);

    const { apiKey, baseUrl: resolvedBaseUrl } = await resolveStrategyApiKey({
      id: config.strategyId,
      model_provider: modelProvider,
    });

    const baseUrl = resolvedBaseUrl || getProviderBaseUrl(modelProvider);
    if (!baseUrl) throw new Error(`No base URL for provider: ${modelProvider}`);

    const filters = config.strategyFilters || strategy.filters || {};
    const aiInputs = filters.aiInputs || {};
    const risk = filters.risk || {};
    const guardrails = filters.guardrails || {};
    const entryExit = filters.entryExit || {};
    const entry = entryExit.entry || {};
    const tradeControl = entryExit.tradeControl || {};
    const confidenceControl = entryExit.confidenceControl || {};

    // --- Gap 8/3: Entry mode migration layer (derive behaviors from mode if not present) ---
    if (!entry.behaviors) {
      const mode = entry.mode || "signal";
      entry.behaviors = {
        trend: mode === "trend" || mode === "signal",
        breakout: mode === "breakout" || mode === "signal",
        meanReversion: mode === "meanReversion" || mode === "signal",
      };
    }
    const entryBehaviors = entry.behaviors || { trend: true, breakout: true, meanReversion: true };
    const entryInstructions = buildEntryInstructions(entryBehaviors);

    // --- Gap 9: Read guardrails from correct location ---
    const allowLong = guardrails.allowLong !== false;
    const allowShort = guardrails.allowShort !== false;
    const minConfidence = confidenceControl.minConfidence ?? guardrails.minConfidence ?? 0.65;

    // --- Gap 10: Trade control settings ---
    const maxTradesPerHour = tradeControl.maxTradesPerHour ?? 2;
    const maxTradesPerDay = tradeControl.maxTradesPerDay ?? 10;
    const cooldownMinutes = tradeControl.cooldownMinutes ?? 15;
    const allowReentrySameDirection = tradeControl.allowReentrySameDirection ?? false;
    const minHoldMinutes = tradeControl.minHoldMinutes ?? 5;
    const exitMode = (entryExit.exit || {}).mode || "signal";

    const { data: userSub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", config.userId)
      .single();

    const tier =
      userSub?.status === "active" && userSub?.plan_id
        ? userSub.plan_id
        : "on_demand";

    const candleCount = aiInputs.candles?.count || 200;
    const requestedInterval = RESOLUTION_TO_CANDLE_INTERVAL[config.resolution] || "1h";
    const FALLBACK_CHAIN: Record<string, string[]> = {
      "15m": ["1h", "4h", "1d"],
      "1h": ["4h", "1d"],
      "4h": ["1d"],
      "1d": [],
    };

    console.log(`[Backtest ${config.backtestId}] Starting: ${config.markets.join(",")} | ${config.resolution} | ${modelProvider}/${normalizedModel}`);

    // --- Fetch primary candles with automatic resolution fallback ---
    let primaryInterval = requestedInterval;
    const candlesByMarket = new Map<string, Candle[]>();
    let resolutionFallback: string | null = null;

    // Try requested resolution first, with retry for transient API failures
    const probeMarket = config.markets[0];
    let probeCandles: Candle[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      probeCandles = await fetchHistoricalCandles(
        probeMarket,
        config.venue,
        config.startDate.getTime(),
        config.endDate.getTime(),
        primaryInterval,
      );
      if (probeCandles.length > 0) break;
      if (attempt === 0) {
        console.log(`[Backtest ${config.backtestId}] Probe returned 0 ${primaryInterval} candles, retrying...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log(`[Backtest ${config.backtestId}] Probe: ${probeCandles.length} ${primaryInterval} candles for ${probeMarket} (${config.startDate.toISOString().slice(0, 10)} to ${config.endDate.toISOString().slice(0, 10)})`);

    if (probeCandles.length === 0) {
      const fallbacks = FALLBACK_CHAIN[primaryInterval] || [];
      for (const fallbackInterval of fallbacks) {
        console.log(`[Backtest ${config.backtestId}] No ${primaryInterval} data available, trying ${fallbackInterval}...`);
        probeCandles = await fetchHistoricalCandles(
          probeMarket,
          config.venue,
          config.startDate.getTime(),
          config.endDate.getTime(),
          fallbackInterval,
        );
        if (probeCandles.length > 0) {
          resolutionFallback = fallbackInterval;
          primaryInterval = fallbackInterval;
          console.log(`[Backtest ${config.backtestId}] Falling back to ${fallbackInterval} resolution (${probeCandles.length} candles found)`);
          break;
        }
      }
    }

    if (probeCandles.length === 0) {
      const msg = `No historical candle data available for ${config.markets.join(", ")} in the selected date range (${config.startDate.toISOString().slice(0, 10)} to ${config.endDate.toISOString().slice(0, 10)}). The data provider may not have data this far back. Try a more recent date range.`;
      console.error(`[Backtest ${config.backtestId}] ${msg}`);
      await supabase
        .from("backtest_runs")
        .update({
          status: "failed",
          error_message: msg,
          completed_ticks: 0,
          actual_cost_cents: 0,
        })
        .eq("id", config.backtestId);
      return;
    }

    // Store probe candles and fetch remaining markets
    candlesByMarket.set(probeMarket, probeCandles);
    for (const market of config.markets) {
      if (market === probeMarket) continue;
      const candles = await fetchHistoricalCandles(
        market,
        config.venue,
        config.startDate.getTime(),
        config.endDate.getTime(),
        primaryInterval,
      );
      candlesByMarket.set(market, candles);
    }

    const htfInterval = HTF_MAP[primaryInterval] || "1d";

    // --- Fetch HTF candles for multi-timeframe analysis ---
    const htfCandlesByMarket = new Map<string, Candle[]>();
    if (htfInterval !== primaryInterval) {
      for (const market of config.markets) {
        try {
          const htfCandles = await fetchHistoricalCandles(
            market,
            config.venue,
            config.startDate.getTime(),
            config.endDate.getTime(),
            htfInterval,
          );
          htfCandlesByMarket.set(market, htfCandles);
          console.log(`[Backtest] Fetched ${htfCandles.length} HTF (${htfInterval}) candles for ${market}`);
        } catch (err) {
          console.error(`[Backtest] Failed to fetch HTF candles for ${market}: ${err}`);
        }
      }
    }

    const resolutionMs = RESOLUTION_MS[primaryInterval] || 60 * 60 * 1000;
    const htfResolutionMs = RESOLUTION_MS[htfInterval] || 24 * 60 * 60 * 1000;
    const totalTicks = Math.ceil(
      (config.endDate.getTime() - config.startDate.getTime()) / resolutionMs
    );

    const updateFields: any = { total_ticks: totalTicks };
    if (resolutionFallback) {
      updateFields.resolution = resolutionFallback;
    }
    await supabase
      .from("backtest_runs")
      .update(updateFields)
      .eq("id", config.backtestId);

    const recentDecisions: any[] = [];
    const recentTrades: any[] = [];

    // --- Gap 6: In-memory market performance stats ---
    const marketPerfStats = new Map<string, { wins: number; losses: number; totalPnl: number }>();

    // --- Gap 10: In-memory trade timestamps for frequency/cooldown tracking ---
    // openTradeTimestamps: only entry ("open") trades — used for frequency limits (matches live route's action="open" filter)
    // lastTradeTimeByMarket: any trade type — used for cooldown (matches live route's unfiltered query)
    const openTradeTimestamps: Date[] = [];
    const lastTradeTimeByMarket = new Map<string, Date>();
    const positionOpenTimeByMarket = new Map<string, Date>();
    const peakPriceByMarket = new Map<string, number>();
    const exitRules = entryExit.exit || {};
    const maxDailyLossPct = risk.maxDailyLossPct ?? 5;
    let dailyStartEquity = account.equity;
    let currentDayUTC = new Date(config.startDate).toISOString().slice(0, 10);

    for (let tickIndex = 0; tickIndex < totalTicks; tickIndex++) {
      const tickTime = new Date(config.startDate.getTime() + tickIndex * resolutionMs);
      const tickMs = tickTime.getTime();

      // Check cancel/balance every 3 ticks (or first tick) to reduce DB overhead
      if (tickIndex % 3 === 0) {
        const { data: runCheck } = await supabase
          .from("backtest_runs")
          .select("status")
          .eq("id", config.backtestId)
          .single();

        if (runCheck?.status === "cancelled") {
          console.log(`[Backtest ${config.backtestId}] Cancelled at tick ${tickIndex}`);
          await supabase
            .from("backtest_runs")
            .update({
              completed_ticks: tickIndex,
              actual_cost_cents: totalActualCostCents,
              completed_at: new Date().toISOString(),
            })
            .eq("id", config.backtestId);
          return;
        }

        const { data: bal } = await supabase
          .from("user_balance")
          .select("balance_cents, subscription_budget_cents")
          .eq("user_id", config.userId)
          .single();

        const available = (bal?.balance_cents || 0) + (bal?.subscription_budget_cents || 0);
        if (available <= 0) {
        console.log(`[Backtest ${config.backtestId}] Insufficient balance at tick ${tickIndex}`);
        await supabase
          .from("backtest_runs")
          .update({
            status: "failed",
            error_message: "Insufficient balance to continue backtest",
            completed_ticks: tickIndex,
          })
          .eq("id", config.backtestId);
        return;
        }
      }

      const currentPrices = new Map<string, number>();
      for (const market of config.markets) {
        const candles = candlesByMarket.get(market) || [];
        const candle = findCandleAtTime(candles, tickMs, resolutionMs);
        if (candle) {
          currentPrices.set(market, candle.c);
        }
      }

      const currentEquity = updateEquity(account, currentPrices);
      equityPoints.push({
        tickIndex,
        equity: currentEquity,
        cash: account.cash,
        timestamp: tickTime,
      });

      // === PRE-AI: Daily loss limit check ===
      const tickDayUTC = tickTime.toISOString().slice(0, 10);
      if (tickDayUTC !== currentDayUTC) {
        dailyStartEquity = currentEquity;
        currentDayUTC = tickDayUTC;
      }

      // === PRE-AI: Automated exit checks (tp_sl, trailing, time, signal safety caps) ===
      // Mirrors the live route's exit checks that run BEFORE the AI call
      for (const [market, pos] of Array.from(account.positions.entries())) {
        const price = currentPrices.get(market);
        if (!price) continue;

        const entryPrice = pos.avgEntry;
        const unrealizedPnl = pos.side === "long"
          ? (price - entryPrice) * pos.size
          : (entryPrice - price) * pos.size;
        const unrealizedPnlPct = entryPrice > 0
          ? (unrealizedPnl / (entryPrice * pos.size)) * 100
          : 0;

        let shouldExit = false;
        let exitReason = "";
        let isEmergencyExit = false;
        let isTimeBasedExit = false;

        if (exitRules.mode === "signal") {
          if (exitRules.maxLossProtectionPct && unrealizedPnlPct <= -Math.abs(exitRules.maxLossProtectionPct)) {
            shouldExit = true;
            isEmergencyExit = true;
            exitReason = `Max loss protection: ${unrealizedPnlPct.toFixed(2)}% <= -${exitRules.maxLossProtectionPct}%`;
          } else if (exitRules.maxProfitCapPct && unrealizedPnlPct >= exitRules.maxProfitCapPct) {
            shouldExit = true;
            isEmergencyExit = true;
            exitReason = `Max profit cap: ${unrealizedPnlPct.toFixed(2)}% >= ${exitRules.maxProfitCapPct}%`;
          }
        } else if (exitRules.mode === "tp_sl") {
          if (exitRules.takeProfitPct && unrealizedPnlPct >= exitRules.takeProfitPct) {
            shouldExit = true;
            exitReason = `Take profit: ${unrealizedPnlPct.toFixed(2)}% >= ${exitRules.takeProfitPct}%`;
          } else if (exitRules.stopLossPct && Math.abs(unrealizedPnlPct) >= exitRules.stopLossPct && unrealizedPnl < 0) {
            shouldExit = true;
            isEmergencyExit = true;
            exitReason = `Stop loss: ${Math.abs(unrealizedPnlPct).toFixed(2)}% >= ${exitRules.stopLossPct}%`;
          }
        } else if (exitRules.mode === "trailing" && exitRules.trailingStopPct) {
          let peakPrice = peakPriceByMarket.get(market) ?? entryPrice;
          if (pos.side === "long" && price > peakPrice) peakPrice = price;
          if (pos.side === "short" && price < peakPrice) peakPrice = price;
          peakPriceByMarket.set(market, peakPrice);

          const dropFromPeakPct = pos.side === "long"
            ? ((peakPrice - price) / entryPrice) * 100
            : ((price - peakPrice) / entryPrice) * 100;

          if (dropFromPeakPct >= exitRules.trailingStopPct) {
            shouldExit = true;
            isEmergencyExit = true;
            exitReason = `Trailing stop: ${dropFromPeakPct.toFixed(2)}% from ${pos.side === "long" ? "peak" : "trough"} $${peakPrice.toFixed(2)}`;
          }
          if (!shouldExit && exitRules.initialStopLossPct && unrealizedPnlPct <= -Math.abs(exitRules.initialStopLossPct)) {
            shouldExit = true;
            isEmergencyExit = true;
            exitReason = `Initial stop loss: ${Math.abs(unrealizedPnlPct).toFixed(2)}% >= ${exitRules.initialStopLossPct}%`;
          }
        } else if (exitRules.mode === "time" && exitRules.maxHoldMinutes) {
          const openTime = positionOpenTimeByMarket.get(market);
          if (openTime) {
            const holdMinutes = (tickMs - openTime.getTime()) / 60000;
            if (holdMinutes >= exitRules.maxHoldMinutes) {
              shouldExit = true;
              isTimeBasedExit = true;
              exitReason = `Max hold time: ${holdMinutes.toFixed(0)} min >= ${exitRules.maxHoldMinutes} min`;
            }
          }
        }

        if (shouldExit && !isEmergencyExit && !isTimeBasedExit) {
          const openTime = positionOpenTimeByMarket.get(market);
          if (openTime) {
            const holdMs = tickMs - openTime.getTime();
            if (holdMs < minHoldMinutes * 60 * 1000) {
              shouldExit = false;
            }
          }
        }

        if (shouldExit) {
          const closeSide = pos.side === "long" ? "sell" : "buy";
          const { fillPrice, fee } = simulateExecution(price, closeSide as "buy" | "sell", pos.size);
          const realizedPnl = pos.side === "long"
            ? (fillPrice - entryPrice) * pos.size - fee
            : (entryPrice - fillPrice) * pos.size - fee;

          account.cash += entryPrice * pos.size + realizedPnl;
          account.positions.delete(market);
          positionOpenTimeByMarket.delete(market);
          peakPriceByMarket.delete(market);

          trades.push({
            market, action: "close", side: closeSide as "buy" | "sell",
            size: pos.size, price: fillPrice, fee, realizedPnl,
            tickIndex, tickTimestamp: tickTime, reasoning: exitReason,
          });
          lastTradeTimeByMarket.set(market, tickTime);
          recentTrades.push({
            timestamp: tickTime.toISOString(), market, side: closeSide,
            action: "close", price: fillPrice, size: pos.size, realizedPnl,
          });

          const existing = marketPerfStats.get(market) || { wins: 0, losses: 0, totalPnl: 0 };
          if (realizedPnl > 0) existing.wins++; else existing.losses++;
          existing.totalPnl += realizedPnl;
          marketPerfStats.set(market, existing);

          console.log(`[Backtest] AUTO-EXIT tick=${tickIndex} market=${market} | ${exitReason} → PnL: ${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(2)}`);
        }
      }

      // === PHASE 1: Build context for all markets (fast, CPU-only) ===
      const accountSnapshot = {
        starting_equity: account.startingEquity,
        current_equity: account.equity,
        cash_balance: account.cash,
        available_cash: account.cash,
        total_return_pct:
          ((account.equity - account.startingEquity) / account.startingEquity) * 100,
      };

      const allPositionsSnapshot = Array.from(account.positions.values()).map((p) => {
        const unrealized_pnl =
          p.side === "long"
            ? ((currentPrices.get(p.market) || p.avgEntry) - p.avgEntry) * p.size
            : (p.avgEntry - (currentPrices.get(p.market) || p.avgEntry)) * p.size;
        return {
          market: p.market,
          side: p.side,
          size: p.size,
          avg_entry: p.avgEntry,
          unrealized_pnl,
          position_value: p.avgEntry * p.size + unrealized_pnl,
        };
      });

      const marketPerformanceStatsSnapshot = Array.from(marketPerfStats.entries()).map(([m, s]) => ({
        market: m, wins: s.wins, losses: s.losses, totalPnl: s.totalPnl,
      }));

      const recentDecisionsSnapshot = aiInputs.includeRecentDecisions !== false
        ? recentDecisions.slice(-(aiInputs.recentDecisionsCount || 5)).reverse()
        : [];
      const recentTradesSnapshot = aiInputs.includeRecentTrades !== false
        ? recentTrades.slice(-(aiInputs.recentTradesCount || 10)).reverse()
        : [];

      interface MarketTickCtx {
        market: string;
        price: number;
        indicatorsSnapshot: any;
        marketAnalysis: any;
        marketType: "perpetual" | "spot";
        canShort: boolean;
        effectiveMaxLeverage: number;
      }

      const marketContexts: MarketTickCtx[] = [];
      const aiPromises: Promise<{ ok: true; response: IntentWithUsage } | { ok: false; error: string }>[] = [];

      const marketProcessingMode = filters.marketProcessingMode || "all";
      const marketsThisTick = (marketProcessingMode === "round-robin" && config.markets.length > 1)
        ? [config.markets[tickIndex % config.markets.length]]
        : config.markets;

      for (const market of marketsThisTick) {
        const price = currentPrices.get(market);
        if (!price) continue;

        const allCandles = candlesByMarket.get(market) || [];
        const currentCandleIdx = allCandles.findIndex(
          (c) => c.t >= tickMs - resolutionMs && c.t <= tickMs
        );
        if (currentCandleIdx < 0) continue;

        const slicedCandles = sliceCandles(allCandles, currentCandleIdx, candleCount);
        const candlesForIndicators = slicedCandles.map((c) => ({
          t: c.time, T: c.time + resolutionMs,
          o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, n: 0,
        }));

        let indicatorsSnapshot: any = {};
        if (aiInputs.indicators && candlesForIndicators.length > 0) {
          try {
            indicatorsSnapshot = calculateIndicators(candlesForIndicators, {
              rsi: aiInputs.indicators.rsi, atr: aiInputs.indicators.atr,
              volatility: aiInputs.indicators.volatility, ema: aiInputs.indicators.ema,
              macd: aiInputs.indicators.macd, bollingerBands: aiInputs.indicators.bollingerBands,
              supportResistance: aiInputs.indicators.supportResistance, volume: aiInputs.indicators.volume,
            });
          } catch {}
        }

        let htfIndicators: any = null;
        const htfAllCandles = htfCandlesByMarket.get(market) || [];
        if (htfAllCandles.length > 0) {
          const htfCandleIdx = htfAllCandles.findIndex(
            (c) => c.t >= tickMs - htfResolutionMs && c.t <= tickMs
          );
          const htfSliceEnd = htfCandleIdx >= 0 ? htfCandleIdx + 1 : htfAllCandles.filter(c => c.t <= tickMs).length;
          const htfSlice = htfAllCandles.slice(Math.max(0, htfSliceEnd - 50), htfSliceEnd);
          if (htfSlice.length > 0) {
            try {
              const htfFormatted = htfSlice.map((c) => ({
                t: c.t, T: c.t + htfResolutionMs,
                o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, n: 0,
              }));
              htfIndicators = calculateIndicators(htfFormatted, {
                rsi: { enabled: true, period: 14 }, ema: { enabled: true, fast: 12, slow: 26 },
                macd: { enabled: true }, supportResistance: { enabled: true, lookback: 50 },
              });
            } catch {}
          }
        }

        let marketAnalysis: any = null;
        if (candlesForIndicators.length > 0) {
          try {
            marketAnalysis = runMarketAnalysis({
              market,
              candles: candlesForIndicators, currentPrice: price,
              indicators: indicatorsSnapshot, htfIndicators: htfIndicators || undefined,
              primaryTimeframe: primaryInterval, htfTimeframe: htfInterval,
            });
          } catch {}
        }

        const detected = detectMarketType(market, config.venue);
        const marketType = detected.marketType;
        const effectiveMaxLeverage = marketType === "perpetual" ? (risk.maxLeverage ?? 2) : 1;
        const canShortForMarket = marketType === "perpetual" && allowShort;

        const position = account.positions.get(market) || null;
        const positionContext = position
          ? {
              side: position.side, size: position.size, avg_entry: position.avgEntry,
              unrealized_pnl: position.side === "long"
                ? (price - position.avgEntry) * position.size
                : (position.avgEntry - price) * position.size,
            }
          : null;

        const marketData: any = {
          market,
          price,
          timestamp: "current",
        };
        if (aiInputs.candles?.enabled) {
          const baseTime = slicedCandles.length > 0 ? slicedCandles[0].time : 0;
          marketData.candles = slicedCandles.map((c) => ({
            time: c.time - baseTime,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));
          marketData.candlesCount = slicedCandles.length;
        }

        const strategyConstraints: any = {
          entryBehaviors, entryInstructions, marketType,
          maxLeverage: effectiveMaxLeverage, allowLong, allowShort: canShortForMarket,
        };

        marketContexts.push({
          market, price, indicatorsSnapshot, marketAnalysis,
          marketType, canShort: canShortForMarket, effectiveMaxLeverage,
        });

        // Start AI call (don't await — fire in parallel)
        aiPromises.push(
          openAICompatibleIntentCall({
            baseUrl, apiKey, model: normalizedModel,
            prompt: config.strategyPrompt,
            currentTime: tickMs,
            context: {
              market,
              marketData,
              positions: aiInputs.includePositionState !== false
                ? allPositionsSnapshot
                : [],
              currentMarketPosition: aiInputs.includePositionState !== false ? positionContext : null,
              indicators: indicatorsSnapshot, marketAnalysis,
              recentDecisions: recentDecisionsSnapshot,
              recentTrades: recentTradesSnapshot,
              newsContext: null,
              account: accountSnapshot,
              strategy: strategyConstraints,
              marketPerformanceStats: marketPerformanceStatsSnapshot.length > 0 ? marketPerformanceStatsSnapshot : undefined,
            },
            provider: modelProvider,
          }).then(r => ({ ok: true as const, response: r }))
            .catch((err: any) => ({ ok: false as const, error: err.message || "Unknown AI error" }))
        );
      }

      // === PHASE 2: Await ALL AI calls in parallel ===
      const aiResults = await Promise.all(aiPromises);

      // === PHASE 3: Process results sequentially (billing, guardrails, trades) ===
      for (let mi = 0; mi < marketContexts.length; mi++) {
        const ctx = marketContexts[mi];
        const { market, price, indicatorsSnapshot, marketAnalysis, canShort: canShortForMarket, effectiveMaxLeverage } = ctx;
        const aiResult = aiResults[mi];

        if (!aiResult.ok) {
          const errMsg = (aiResult as { ok: false; error: string }).error;
          console.error(`[Backtest] AI call failed at tick ${tickIndex} market=${market}: ${errMsg}`);
          decisions.push({
            tickIndex, market, tickTimestamp: tickTime, price,
            intent: { bias: "neutral", error: errMsg },
            confidence: 0, reasoning: `AI error: ${errMsg}`,
            actionSummary: "AI call failed — skipped", inputTokens: 0, outputTokens: 0,
          });
          continue;
        }

        const { intent, usage } = aiResult.response;

        const rawConfidence = intent.confidence || 0;
        const compressed = 0.5 * (1 + Math.tanh(2.5 * (rawConfidence - 0.65)));
        const regimePenalty = marketAnalysis?.multiTimeframe?.alignment === "conflicting" ? 0.10 : 0;
        let confidence = Math.max(0, compressed - regimePenalty);

        const actualCostUsd = calculateCost(normalizedModel, usage.inputTokens, usage.outputTokens);
        const ondemandMarkup = getMarkupForTier("on_demand");
        const subscriptionMarkup = getMarkupForTier(tier);
        const ondemandChargeCents = Math.max(1, Math.round(actualCostUsd * (1 + ondemandMarkup) * 100));
        const subscriptionChargeCents = Math.max(1, Math.round(actualCostUsd * (1 + subscriptionMarkup) * 100));
        const effectiveSubMarkup = ondemandChargeCents > 0 ? subscriptionChargeCents / ondemandChargeCents - 1 : 0;

        const { data: deductResult } = await supabase.rpc("decrement_user_balance_v2", {
          p_user_id: config.userId,
          p_base_cost_cents: ondemandChargeCents,
          p_ondemand_markup: 0,
          p_subscription_markup: effectiveSubMarkup,
          p_description: `Backtest AI (${normalizedModel})`,
          p_metadata: {
            backtest_id: config.backtestId, tick_index: tickIndex,
            model: normalizedModel, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
          },
        });

        if (deductResult?.success) {
          totalActualCostCents += deductResult.amount_deducted_cents || 0;
        } else if (deductResult?.error === "insufficient_balance" || deductResult?.error === "no_balance") {
          await supabase.from("backtest_runs").update({
            status: "failed", error_message: "Insufficient balance",
            completed_ticks: tickIndex, actual_cost_cents: totalActualCostCents,
          }).eq("id", config.backtestId);
          return;
        }

        intent.market = market;
        const position = account.positions.get(market) || null;

        let actionSummary = `${intent.bias} (conf: raw=${(rawConfidence * 100).toFixed(0)}% cal=${(confidence * 100).toFixed(0)}%)`;
        let executedTrade = false;
        let blocked = false;

        // ====================================================================
        // POST-AI GUARDRAILS — mirror the live tick route's enforcement chain
        // ====================================================================

        // --- Gap 9: Guardrail enforcement (allowLong / allowShort) ---
        if (intent.bias === "long" && !allowLong) {
          actionSummary = "Long positions not allowed by strategy settings";
          blocked = true;
        } else if (intent.bias === "short" && !canShortForMarket) {
          actionSummary = "Short positions not allowed by strategy settings";
          blocked = true;
        } else if (intent.bias === "neutral" || intent.bias === "hold") {
          actionSummary = `AI decision: ${intent.bias} (no trade)`;
          blocked = true;
        } else if (intent.bias === "close" && !position) {
          actionSummary = "AI said 'close' but no position to close";
          blocked = true;
        }

        // --- EXIT GUARDRAILS: minHoldMinutes + min confidence for exits ---
        // Mirrors live route: AI-driven exits (close or reversal) must pass hold time and confidence
        if (!blocked && position && exitMode === "signal") {
          const isExitIntent = intent.bias === "close" ||
            (intent.bias === "long" && position.side === "short") ||
            (intent.bias === "short" && position.side === "long");

          if (isExitIntent) {
            const posOpenTime = positionOpenTimeByMarket.get(market);
            if (posOpenTime) {
              const holdMs = tickMs - posOpenTime.getTime();
              const minHoldMs = minHoldMinutes * 60 * 1000;
              if (holdMs < minHoldMs) {
                const remainingMin = Math.ceil((minHoldMs - holdMs) / 1000 / 60);
                actionSummary = `Min hold time: AI wanted to ${intent.bias === "close" ? "close" : "reverse"} but ${remainingMin} min remaining`;
                blocked = true;
              }
            }

            if (!blocked && confidence < minConfidence) {
              actionSummary = `AI exit blocked by min confidence: ${(confidence * 100).toFixed(0)}% < ${(minConfidence * 100).toFixed(0)}%`;
              blocked = true;
            }
          }

          if (!blocked && intent.bias === position.side) {
            actionSummary = `Hold: AI confirms ${position.side} position`;
            blocked = true;
          }
        }

        // --- Min confidence threshold for ENTRIES ---
        if (!blocked && (intent.bias === "long" || intent.bias === "short") && !position) {
          if (confidence < minConfidence) {
            actionSummary = `Confidence ${(confidence * 100).toFixed(0)}% below minimum ${(minConfidence * 100).toFixed(0)}%`;
            blocked = true;
          }
        }

        // --- Position stacking check (matches live system's 3-way logic) ---
        // In signal mode, opposite direction = reversal (handled by reversal handler after exit guardrails)
        // In non-signal mode, opposite direction = blocked (live system blocks this at stacking check)
        if (!blocked && (intent.bias === "long" || intent.bias === "short") && position) {
          const desiredSide = intent.bias as "long" | "short";
          const exitMode = exitRules.mode || "signal";

          if (desiredSide !== position.side && exitMode === "signal") {
            // Signal mode reversal — exit guardrails already checked, let reversal handler close
          } else if (allowReentrySameDirection && desiredSide === position.side) {
            // Same direction + stacking allowed → but check minHold first
            const stackOpenTime = positionOpenTimeByMarket.get(market);
            if (stackOpenTime) {
              const holdMs = tickMs - stackOpenTime.getTime();
              if (holdMs < minHoldMinutes * 60 * 1000) {
                const remainingMin = Math.ceil((minHoldMinutes * 60 * 1000 - holdMs) / 1000 / 60);
                actionSummary = `Min hold time (stacking): ${remainingMin} min remaining before adding`;
                blocked = true;
              }
            }
          } else if (desiredSide !== position.side) {
            actionSummary = `Cannot enter ${desiredSide} while in ${position.side} — exit mode "${exitMode}" controls exits`;
            blocked = true;
          } else {
            actionSummary = `Already in ${position.side} position — stacking disabled`;
            blocked = true;
          }
        }

        // --- Gap 11: MTF alignment gate ---
        if (!blocked && (intent.bias === "long" || intent.bias === "short") && !position) {
          if (marketAnalysis?.multiTimeframe?.alignment === "conflicting") {
            actionSummary = `MTF conflict: primary and higher timeframe trends disagree`;
            blocked = true;
          }
        }

        // --- Gap 4: Entry behavior classification ---
        if (!blocked && (intent.bias === "long" || intent.bias === "short") && !position) {
          const entryType = classifyEntryType(intent, price, indicatorsSnapshot, marketAnalysis);

          if (!entryBehaviors.trend && !entryBehaviors.breakout && !entryBehaviors.meanReversion) {
            actionSummary = "No entry behaviors enabled — all entries blocked";
            blocked = true;
          } else if (entryType === "trend" && !entryBehaviors.trend) {
            actionSummary = "Entry type 'Trend' not allowed by strategy settings";
            blocked = true;
          } else if (entryType === "breakout" && !entryBehaviors.breakout) {
            actionSummary = "Entry type 'Breakout' not allowed by strategy settings";
            blocked = true;
          } else if (entryType === "meanReversion" && !entryBehaviors.meanReversion) {
            actionSummary = "Entry type 'Mean Reversion' not allowed by strategy settings";
            blocked = true;
          } else if (entryType === "unknown" && (!entryBehaviors.trend || !entryBehaviors.breakout || !entryBehaviors.meanReversion)) {
            actionSummary = "Entry type unclassifiable — blocked because not all behaviors are enabled";
            blocked = true;
          }
        }

        // --- Entry confirmation (minSignals + volatility condition) ---
        if (!blocked && (intent.bias === "long" || intent.bias === "short") && !position) {
          const confirmation = entry.confirmation || {};
          const minSignals = confirmation.minSignals ?? 1;
          if (minSignals > 1) {
            const requiredConf = minConfidence + (minSignals - 1) * 0.1;
            if (confidence < requiredConf) {
              actionSummary = `Entry confirmation: Need ${minSignals} signals, confidence too low`;
              blocked = true;
            }
          }

          if (!blocked && confirmation.requireVolatilityCondition && (confirmation.volatilityMin || confirmation.volatilityMax)) {
            let currentVol = 0;
            let hasVol = true;
            if (indicatorsSnapshot?.atr) {
              currentVol = (indicatorsSnapshot.atr.value / price) * 100;
            } else if (indicatorsSnapshot?.volatility) {
              currentVol = indicatorsSnapshot.volatility.value;
            } else {
              const allCandlesForVol = candlesByMarket.get(market) || [];
              const recentCandle = findCandleAtTime(allCandlesForVol, tickMs, resolutionMs);
              if (recentCandle && recentCandle.c > 0) {
                currentVol = ((recentCandle.h - recentCandle.l) / recentCandle.c) * 100;
              } else {
                hasVol = false;
              }
            }
            if (hasVol) {
              if (confirmation.volatilityMin && currentVol < confirmation.volatilityMin) {
                actionSummary = `Volatility ${currentVol.toFixed(2)}% below min ${confirmation.volatilityMin}%`;
                blocked = true;
              } else if (confirmation.volatilityMax && currentVol > confirmation.volatilityMax) {
                actionSummary = `Volatility ${currentVol.toFixed(2)}% exceeds max ${confirmation.volatilityMax}%`;
                blocked = true;
              }
            }
          }
        }

        // --- Gap 10: Trade frequency & cooldown ---
        if (!blocked && (intent.bias === "long" || intent.bias === "short") && !position) {
          const oneHourAgo = new Date(tickMs - 60 * 60 * 1000);
          const oneDayAgo = new Date(tickMs - 24 * 60 * 60 * 1000);

          const tradesLastHour = openTradeTimestamps.filter(t => t >= oneHourAgo).length;
          const tradesLastDay = openTradeTimestamps.filter(t => t >= oneDayAgo).length;

          if (tradesLastHour >= maxTradesPerHour) {
            actionSummary = `Trade frequency limit: ${tradesLastHour}/${maxTradesPerHour} trades in last hour`;
            blocked = true;
          } else if (tradesLastDay >= maxTradesPerDay) {
            actionSummary = `Trade frequency limit: ${tradesLastDay}/${maxTradesPerDay} trades in last day`;
            blocked = true;
          }

          if (!blocked) {
            const lastTradeTime = lastTradeTimeByMarket.get(market);
            if (lastTradeTime) {
              const timeSinceLastTrade = tickMs - lastTradeTime.getTime();
              const cooldownMs = cooldownMinutes * 60 * 1000;
              if (timeSinceLastTrade < cooldownMs) {
                const remainingMin = Math.ceil((cooldownMs - timeSinceLastTrade) / 1000 / 60);
                actionSummary = `Cooldown: ${remainingMin} minutes remaining`;
                blocked = true;
              }
            }
          }
        }

        // --- Max daily loss check ---
        if (!blocked && (intent.bias === "long" || intent.bias === "short") && !position) {
          const dailyLossPct = dailyStartEquity > 0
            ? ((dailyStartEquity - account.equity) / dailyStartEquity) * 100
            : 0;
          if (dailyLossPct >= maxDailyLossPct) {
            actionSummary = `Max daily loss: ${dailyLossPct.toFixed(2)}% >= ${maxDailyLossPct}%`;
            blocked = true;
          }
        }

        // ====================================================================
        // TRADE EXECUTION — only if not blocked
        // ====================================================================

        if (!blocked && intent.bias === "close" && position && exitRules.mode !== "signal") {
          actionSummary = `AI recommends close but exit mode is "${exitRules.mode}" — waiting for automated rules`;
          blocked = true;
        }

        if (!blocked && intent.bias === "close" && position) {
          const closeSide = position.side === "long" ? "sell" : "buy";
          const { fillPrice, fee } = simulateExecution(price, closeSide as "buy" | "sell", position.size);
          const realizedPnl =
            position.side === "long"
              ? (fillPrice - position.avgEntry) * position.size - fee
              : (position.avgEntry - fillPrice) * position.size - fee;

          account.cash += position.avgEntry * position.size + realizedPnl;
          account.positions.delete(market);
          positionOpenTimeByMarket.delete(market);
          peakPriceByMarket.delete(market);

          const trade: BacktestTradeRecord = {
            market,
            action: "close",
            side: closeSide as "buy" | "sell",
            size: position.size,
            price: fillPrice,
            fee,
            realizedPnl,
            tickIndex,
            tickTimestamp: tickTime,
            reasoning: intent.reasoning,
          };
          trades.push(trade);
          lastTradeTimeByMarket.set(market, tickTime);
          recentTrades.push({
            timestamp: tickTime.toISOString(),
            market,
            side: closeSide,
            action: "close",
            price: fillPrice,
            size: position.size,
            realizedPnl,
          });

          // --- Gap 6: Update perf stats ---
          const existing = marketPerfStats.get(market) || { wins: 0, losses: 0, totalPnl: 0 };
          if (realizedPnl > 0) existing.wins++;
          else existing.losses++;
          existing.totalPnl += realizedPnl;
          marketPerfStats.set(market, existing);

          actionSummary = `Closed ${position.side} → PnL: ${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(2)}`;
          executedTrade = true;
        } else if (
          !blocked &&
          (intent.bias === "long" || intent.bias === "short") &&
          !position
        ) {
          const maxPositionUsd = risk.maxPositionUsd ?? 10000;
          const MIN_ORDER_USD = 10;
          const orderSide = intent.bias === "long" ? "buy" as const : "sell" as const;

          const aiLeverage = intent.leverage ?? 1;
          const confidenceRange = 1.0 - minConfidence;
          const confidenceAboveMin = Math.max(0, confidence - minConfidence);
          const leverageScale = confidenceRange > 0 ? Math.min(1.0, confidenceAboveMin / confidenceRange) : 1.0;
          const scaledMaxLeverage = Math.max(1, Math.round(1 + (effectiveMaxLeverage - 1) * leverageScale));
          const actualLeverage = Math.max(1, Math.min(Math.round(aiLeverage), scaledMaxLeverage));

          const totalCurrentExposure = Array.from(account.positions.values()).reduce(
            (sum, p) => sum + p.avgEntry * p.size, 0
          );
          const aiTargetExposure = account.equity * actualLeverage * 0.99;
          const maxExposureAllowed = account.equity * effectiveMaxLeverage * 0.99;
          const effectiveExposureCeiling = Math.min(aiTargetExposure, maxExposureAllowed);
          const remainingLeverageRoom = Math.max(0, effectiveExposureCeiling - totalCurrentExposure);

          let positionNotional = Math.min(maxPositionUsd, remainingLeverageRoom);

          if (confidenceControl.confidenceScaling && rawConfidence > 0) {
            positionNotional = positionNotional * rawConfidence;
          }
          positionNotional = Math.min(positionNotional, maxPositionUsd);

          if (positionNotional < MIN_ORDER_USD) {
            positionNotional = MIN_ORDER_USD;
          }

          if (!blocked) {
            const orderSize = price > 0 ? positionNotional / price : 0;
            if (orderSize > 0) {
              const { fillPrice, fee } = simulateExecution(price, orderSide, orderSize);
              const notional = fillPrice * orderSize;

              account.cash -= notional + fee;
              account.positions.set(market, {
                market,
                side: intent.bias as "long" | "short",
                size: orderSize,
                avgEntry: fillPrice,
                leverage: actualLeverage,
              });

              const trade: BacktestTradeRecord = {
                market,
                action: "open",
                side: orderSide,
                size: orderSize,
                price: fillPrice,
                fee,
                realizedPnl: 0,
                tickIndex,
                tickTimestamp: tickTime,
                reasoning: intent.reasoning,
              };
              trades.push(trade);
              openTradeTimestamps.push(tickTime);
              lastTradeTimeByMarket.set(market, tickTime);
              positionOpenTimeByMarket.set(market, tickTime);
              peakPriceByMarket.set(market, fillPrice);
              recentTrades.push({
                timestamp: tickTime.toISOString(),
                market,
                side: orderSide,
                action: "open",
                price: fillPrice,
                size: orderSize,
                realizedPnl: null,
              });
              actionSummary = `Opened ${intent.bias} ${orderSize.toFixed(6)} @ $${fillPrice.toFixed(2)} (lev=${actualLeverage}x)`;
              executedTrade = true;
            }
          }
        } else if (
          !blocked &&
          ((intent.bias === "long" && position?.side === "short") ||
           (intent.bias === "short" && position?.side === "long"))
        ) {
          if (position) {
            const closeSide = position.side === "long" ? "sell" : "buy";
            const { fillPrice: closePrice, fee: closeFee } = simulateExecution(
              price,
              closeSide as "buy" | "sell",
              position.size
            );
            const realizedPnl =
              position.side === "long"
                ? (closePrice - position.avgEntry) * position.size - closeFee
                : (position.avgEntry - closePrice) * position.size - closeFee;

            account.cash += position.avgEntry * position.size + realizedPnl;
            account.positions.delete(market);
            positionOpenTimeByMarket.delete(market);
            peakPriceByMarket.delete(market);

            trades.push({
              market,
              action: "close",
              side: closeSide as "buy" | "sell",
              size: position.size,
              price: closePrice,
              fee: closeFee,
              realizedPnl,
              tickIndex,
              tickTimestamp: tickTime,
              reasoning: `Flip: closing ${position.side} before opening ${intent.bias}`,
            });
            lastTradeTimeByMarket.set(market, tickTime);

            // --- Gap 6: Update perf stats for the close ---
            const existing = marketPerfStats.get(market) || { wins: 0, losses: 0, totalPnl: 0 };
            if (realizedPnl > 0) existing.wins++;
            else existing.losses++;
            existing.totalPnl += realizedPnl;
            marketPerfStats.set(market, existing);

            actionSummary = `Flipped: closed ${position.side} (PnL: ${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(2)})`;
            executedTrade = true;
          }
        }

        if (blocked) {
          console.log(`[Backtest] BLOCKED tick=${tickIndex} market=${market} bias=${intent.bias} raw=${(rawConfidence * 100).toFixed(0)}% cal=${(confidence * 100).toFixed(0)}% | ${actionSummary}`);
        } else if (executedTrade) {
          console.log(`[Backtest] TRADE tick=${tickIndex} market=${market} | ${actionSummary}`);
        }

        decisions.push({
          tickIndex,
          market,
          tickTimestamp: tickTime,
          price,
          intent,
          confidence,
          reasoning: intent.reasoning,
          actionSummary,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });

        recentDecisions.push({
          timestamp: tickTime.toISOString(),
          bias: intent.bias,
          confidence,
          reasoning: intent.reasoning,
          actionSummary,
          executed: executedTrade,
        });

        if (recentDecisions.length > 10) recentDecisions.shift();
        if (recentTrades.length > 20) recentTrades.shift();
      }

      const updateEvery = totalTicks <= 50 ? 1 : totalTicks <= 200 ? 5 : 10;
      if (tickIndex % updateEvery === 0 || tickIndex === totalTicks - 1) {
        await supabase
          .from("backtest_runs")
          .update({
            completed_ticks: tickIndex + 1,
            actual_cost_cents: totalActualCostCents,
          })
          .eq("id", config.backtestId);

        console.log(
          `[Backtest ${config.backtestId}] Progress: ${tickIndex + 1}/${totalTicks} | Equity: $${account.equity.toFixed(2)} | Trades: ${trades.length} | Cost: $${(totalActualCostCents / 100).toFixed(2)}`
        );
      }
    }

    const remainingPositions = Array.from(account.positions.entries());
    for (const [market, pos] of remainingPositions) {
      const finalPrice = getLastCandlePrice(candlesByMarket, market, config.endDate.getTime(), resolutionMs);
      if (finalPrice) {
        const closeSide = pos.side === "long" ? "sell" : "buy";
        const { fillPrice, fee } = simulateExecution(finalPrice, closeSide as "buy" | "sell", pos.size);
        const realizedPnl =
          pos.side === "long"
            ? (fillPrice - pos.avgEntry) * pos.size - fee
            : (pos.avgEntry - fillPrice) * pos.size - fee;

        account.cash += pos.avgEntry * pos.size + realizedPnl;

        trades.push({
          market,
          action: "close",
          side: closeSide as "buy" | "sell",
          size: pos.size,
          price: fillPrice,
          fee,
          realizedPnl,
          tickIndex: totalTicks - 1,
          tickTimestamp: config.endDate,
          reasoning: "Backtest ended — closing remaining position",
        });

        const existing = marketPerfStats.get(market) || { wins: 0, losses: 0, totalPnl: 0 };
        if (realizedPnl > 0) existing.wins++;
        else existing.losses++;
        existing.totalPnl += realizedPnl;
        marketPerfStats.set(market, existing);
      }
    }
    account.positions.clear();

    const finalEquity = account.cash;
    account.equity = finalEquity;

    const winningTrades = trades.filter((t) => t.action === "close" && t.realizedPnl > 0);
    const losingTrades = trades.filter((t) => t.action === "close" && t.realizedPnl <= 0);
    const closedTrades = trades.filter((t) => t.action === "close" || t.action === "flip");
    const totalPnl = closedTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
    const totalFees = trades.reduce((sum, t) => sum + t.fee, 0);

    const resultSummary: any = {
      return_pct: ((finalEquity - config.startingEquity) / config.startingEquity) * 100,
      total_pnl: totalPnl,
      total_fees: totalFees,
      final_equity: finalEquity,
      win_rate:
        closedTrades.length > 0
          ? (winningTrades.length / closedTrades.length) * 100
          : 0,
      max_drawdown_pct: account.maxDrawdownPct,
      total_trades: trades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      avg_trade_pnl: closedTrades.length > 0 ? totalPnl / closedTrades.length : 0,
    };

    if (resolutionFallback) {
      resultSummary.resolution_fallback = {
        requested: requestedInterval,
        actual: resolutionFallback,
        reason: `No ${requestedInterval} candle data available for this date range. Fell back to ${resolutionFallback}.`,
      };
    }

    if (trades.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < trades.length; i += batchSize) {
        const batch = trades.slice(i, i + batchSize).map((t) => ({
          backtest_id: config.backtestId,
          market: t.market,
          action: t.action,
          side: t.side,
          size: t.size,
          price: t.price,
          fee: t.fee,
          realized_pnl: t.realizedPnl,
          tick_index: t.tickIndex,
          tick_timestamp: t.tickTimestamp.toISOString(),
          reasoning: t.reasoning,
        }));
        await supabase.from("backtest_trades").insert(batch);
      }
    }

    if (equityPoints.length > 0) {
      const maxPoints = 500;
      const step = Math.max(1, Math.floor(equityPoints.length / maxPoints));
      const sampled = equityPoints.filter((_, i) => i % step === 0 || i === equityPoints.length - 1);
      const eqBatch = sampled.map((ep) => ({
        backtest_id: config.backtestId,
        tick_index: ep.tickIndex,
        equity: ep.equity,
        cash_balance: ep.cash,
        tick_timestamp: ep.timestamp.toISOString(),
      }));
      await supabase.from("backtest_equity_points").insert(eqBatch);
    }

    if (decisions.length > 0) {
      const maxDecisions = 1000;
      const step = Math.max(1, Math.floor(decisions.length / maxDecisions));
      const sampled = decisions.filter((_, i) => i % step === 0 || i === decisions.length - 1);
      const decBatch = sampled.map((d) => ({
        backtest_id: config.backtestId,
        tick_index: d.tickIndex,
        market: d.market,
        tick_timestamp: d.tickTimestamp.toISOString(),
        price: d.price,
        intent: d.intent,
        confidence: d.confidence,
        reasoning: d.reasoning,
        action_summary: d.actionSummary,
        input_tokens: d.inputTokens,
        output_tokens: d.outputTokens,
      }));
      await supabase.from("backtest_decisions").insert(decBatch);
    }

    await supabase
      .from("backtest_runs")
      .update({
        status: "completed",
        completed_ticks: totalTicks,
        actual_cost_cents: totalActualCostCents,
        result_summary: resultSummary,
        completed_at: new Date().toISOString(),
      })
      .eq("id", config.backtestId);

    console.log(
      `[Backtest ${config.backtestId}] Completed: Return ${resultSummary.return_pct.toFixed(2)}% | Trades: ${trades.length} | Win Rate: ${resultSummary.win_rate.toFixed(1)}% | Max DD: ${resultSummary.max_drawdown_pct.toFixed(2)}%`
    );
  } catch (err: any) {
    console.error(`[Backtest ${config.backtestId}] Fatal error:`, err);
    await supabase
      .from("backtest_runs")
      .update({
        status: "failed",
        error_message: err.message?.slice(0, 500) || "Unknown error",
        actual_cost_cents: totalActualCostCents,
        completed_at: new Date().toISOString(),
      })
      .eq("id", config.backtestId);
  }
}

function findCandleAtTime(
  candles: Candle[],
  targetMs: number,
  resolutionMs: number
): Candle | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].t <= targetMs && candles[i].t > targetMs - resolutionMs) {
      return candles[i];
    }
  }
  return null;
}

function getLastCandlePrice(
  candlesByMarket: Map<string, Candle[]>,
  market: string,
  endMs: number,
  resolutionMs: number
): number | null {
  const candles = candlesByMarket.get(market);
  if (!candles || candles.length === 0) return null;
  const candle = findCandleAtTime(candles, endMs, resolutionMs);
  return candle?.c || candles[candles.length - 1]?.c || null;
}

async function loadStrategy(supabase: any, strategyId: string) {
  const { data, error } = await supabase
    .from("strategies")
    .select("*")
    .eq("id", strategyId)
    .single();

  if (error || !data) throw new Error(`Strategy not found: ${strategyId}`);
  return data;
}

function getProviderBaseUrl(provider: string): string | null {
  const urls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta/openai",
    xai: "https://api.x.ai/v1",
    deepseek: "https://api.deepseek.com",
    openrouter: "https://openrouter.ai/api/v1",
    together: "https://api.together.xyz/v1",
    groq: "https://api.groq.com/openai/v1",
    qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    glm: "https://open.bigmodel.cn/api/paas/v4",
  };
  return urls[provider.toLowerCase()] || null;
}
