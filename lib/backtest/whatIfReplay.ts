/**
 * What-If Replay Engine
 * Pure synchronous function that replays backtest entries with different exit parameters.
 * Runs client-side in the browser for instant slider feedback.
 *
 * IMPORTANT: Iterates by TIME (tickMs = startDateMs + tickIndex * resolutionMs)
 * exactly like the original backtest engine, NOT by candle array index.
 * This ensures tick_index values from the DB map to the correct timestamps
 * even when candle arrays have gaps.
 */

export interface WhatIfParams {
  stopLossPct: number | null;     // e.g. 2.0 means exit if loss >= 2%
  takeProfitPct: number | null;   // e.g. 5.0 means exit if profit >= 5%
  trailingStopPct: number | null; // e.g. 1.5 means exit if price drops 1.5% from peak
  maxHoldMinutes: number | null;  // e.g. 1440 means force exit after 24h
}

export interface EntryTrade {
  market: string;
  side: string;      // "buy" or "sell"
  size: number;
  price: number;     // entry fill price
  fee: number;
  tick_index: number;
  tick_timestamp: string;
}

export interface CandlePoint {
  t: number; // timestamp ms
  c: number; // close price
}

export interface ReplayTrade {
  market: string;
  action: "open" | "close";
  side: string;
  size: number;
  price: number;
  fee: number;
  realizedPnl: number;
  tickIndex: number;
  time: number;
  reasoning: string;
}

export interface WhatIfMetrics {
  returnPct: number;
  totalPnl: number;
  winRate: number;
  maxDrawdownPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgTradePnl: number;
  finalEquity: number;
}

export interface WhatIfResult {
  trades: ReplayTrade[];
  equityPoints: { tickIndex: number; equity: number; time: number }[];
  metrics: WhatIfMetrics;
}

interface Position {
  market: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  peakPrice: number;
  openTimeMs: number;
}

function applySlippage(price: number, side: string, slippageBps: number): number {
  const slip = price * (slippageBps / 10000);
  return side === "buy" ? price + slip : price - slip;
}

function calcFee(price: number, size: number, feeBps: number): number {
  return price * size * (feeBps / 10000);
}

/**
 * Matches the engine's findCandleAtTime exactly:
 * Searches backward for candle where candle.t <= targetMs && candle.t > targetMs - resolutionMs
 */
function findCandleAtTime(
  candles: CandlePoint[],
  targetMs: number,
  resolutionMs: number
): CandlePoint | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].t <= targetMs && candles[i].t > targetMs - resolutionMs) {
      return candles[i];
    }
  }
  return null;
}

export function runWhatIfReplay(
  entryTrades: EntryTrade[],
  candles: Record<string, CandlePoint[]>,
  params: WhatIfParams,
  startingEquity: number,
  feeBps: number,
  slippageBps: number,
  startDateMs: number,
  endDateMs: number,
  resolutionMs: number,
): WhatIfResult {
  const positions = new Map<string, Position>();
  const trades: ReplayTrade[] = [];
  const equityPoints: { tickIndex: number; equity: number; time: number }[] = [];

  let cash = startingEquity;
  let peakEquity = startingEquity;
  let maxDrawdownPct = 0;

  // Build tick-indexed entry map
  const entriesByTick = new Map<number, EntryTrade[]>();
  for (const t of entryTrades) {
    const arr = entriesByTick.get(t.tick_index) || [];
    arr.push(t);
    entriesByTick.set(t.tick_index, arr);
  }

  const marketKeys = Object.keys(candles);
  if (marketKeys.length === 0) {
    return { trades: [], equityPoints: [], metrics: emptyMetrics(startingEquity) };
  }

  // Match engine: totalTicks = Math.ceil((endDate - startDate) / resolutionMs)
  const totalTicks = Math.ceil((endDateMs - startDateMs) / resolutionMs);

  // Track last known price per market for when candles have gaps
  const lastKnownPrice = new Map<string, number>();

  for (let tickIndex = 0; tickIndex < totalTicks; tickIndex++) {
    // Match engine: tickMs = startDate + tickIndex * resolutionMs
    const tickMs = startDateMs + tickIndex * resolutionMs;

    // Get current prices for all markets at this tick using findCandleAtTime
    const currentPrices = new Map<string, number>();
    for (const market of marketKeys) {
      const candle = findCandleAtTime(candles[market], tickMs, resolutionMs);
      if (candle) {
        currentPrices.set(market, candle.c);
        lastKnownPrice.set(market, candle.c);
      } else {
        // Use last known price if no candle at this tick (matches engine behavior)
        const lkp = lastKnownPrice.get(market);
        if (lkp !== undefined) {
          currentPrices.set(market, lkp);
        }
      }
    }

    // CHECK EXITS for open positions
    const marketsToClose: { market: string; reason: string }[] = [];

    for (const [market, pos] of positions) {
      const price = currentPrices.get(market);
      if (!price) continue;

      // Update peak price for trailing stop
      if (params.trailingStopPct !== null) {
        if (pos.side === "long" && price > pos.peakPrice) pos.peakPrice = price;
        if (pos.side === "short" && price < pos.peakPrice) pos.peakPrice = price;
      }

      const unrealizedPnl = pos.side === "long"
        ? (price - pos.entryPrice) * pos.size
        : (pos.entryPrice - price) * pos.size;
      const unrealizedPnlPct = pos.entryPrice > 0
        ? (unrealizedPnl / (pos.entryPrice * pos.size)) * 100
        : 0;

      let shouldExit = false;
      let exitReason = "";

      // Take Profit check
      if (!shouldExit && params.takeProfitPct !== null && unrealizedPnlPct >= params.takeProfitPct) {
        shouldExit = true;
        exitReason = `TP: ${unrealizedPnlPct.toFixed(2)}% >= ${params.takeProfitPct}%`;
      }

      // Stop Loss check
      if (!shouldExit && params.stopLossPct !== null && unrealizedPnlPct <= -params.stopLossPct) {
        shouldExit = true;
        exitReason = `SL: ${unrealizedPnlPct.toFixed(2)}% <= -${params.stopLossPct}%`;
      }

      // Trailing Stop check
      if (!shouldExit && params.trailingStopPct !== null) {
        const dropFromPeakPct = pos.side === "long"
          ? ((pos.peakPrice - price) / pos.entryPrice) * 100
          : ((price - pos.peakPrice) / pos.entryPrice) * 100;

        if (dropFromPeakPct >= params.trailingStopPct) {
          shouldExit = true;
          exitReason = `Trailing: ${dropFromPeakPct.toFixed(2)}% from peak`;
        }
      }

      // Max Hold Time check
      if (!shouldExit && params.maxHoldMinutes !== null) {
        const holdMinutes = (tickMs - pos.openTimeMs) / 60000;
        if (holdMinutes >= params.maxHoldMinutes) {
          shouldExit = true;
          exitReason = `Time: ${Math.floor(holdMinutes)} min >= ${params.maxHoldMinutes}`;
        }
      }

      if (shouldExit) {
        marketsToClose.push({ market, reason: exitReason });
      }
    }

    // Execute exits
    for (const { market, reason } of marketsToClose) {
      const pos = positions.get(market)!;
      const price = currentPrices.get(market)!;
      const closeSide = pos.side === "long" ? "sell" : "buy";
      const fillPrice = applySlippage(price, closeSide, slippageBps);
      const fee = calcFee(fillPrice, pos.size, feeBps);

      // Match engine: realizedPnl only subtracts exit fee.
      // Entry fee was already deducted from cash at entry time.
      const realizedPnl = pos.side === "long"
        ? (fillPrice - pos.entryPrice) * pos.size - fee
        : (pos.entryPrice - fillPrice) * pos.size - fee;

      cash += pos.entryPrice * pos.size + realizedPnl;
      positions.delete(market);

      trades.push({
        market,
        action: "close",
        side: closeSide,
        size: pos.size,
        price: fillPrice,
        fee,
        realizedPnl,
        tickIndex,
        time: tickMs,
        reasoning: reason,
      });
    }

    // PROCESS ENTRIES at this tick
    const entries = entriesByTick.get(tickIndex) || [];
    for (const entry of entries) {
      // Only open if no existing position in this market
      if (!positions.has(entry.market)) {
        const notional = entry.price * entry.size;
        cash -= notional + entry.fee;

        positions.set(entry.market, {
          market: entry.market,
          side: entry.side === "buy" ? "long" : "short",
          size: entry.size,
          entryPrice: entry.price,
          peakPrice: entry.price,
          openTimeMs: tickMs,
        });

        trades.push({
          market: entry.market,
          action: "open",
          side: entry.side,
          size: entry.size,
          price: entry.price,
          fee: entry.fee,
          realizedPnl: 0,
          tickIndex,
          time: tickMs,
          reasoning: "Original AI entry",
        });
      }
    }

    // Update equity
    let posValue = 0;
    for (const [, pos] of positions) {
      const p = currentPrices.get(pos.market) || pos.entryPrice;
      const pnl = pos.side === "long"
        ? (p - pos.entryPrice) * pos.size
        : (pos.entryPrice - p) * pos.size;
      posValue += pos.entryPrice * pos.size + pnl;
    }
    const equity = cash + posValue;

    if (equity > peakEquity) peakEquity = equity;
    const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;

    // Sample equity points (every tick for accuracy, UI will downsample if needed)
    equityPoints.push({ tickIndex, equity, time: tickMs });
  }

  // Force-close remaining positions — match engine: use endDateMs for candle lookup
  const lastTickMs = startDateMs + (totalTicks - 1) * resolutionMs;
  for (const [market, pos] of positions) {
    // Match engine's getLastCandlePrice: look at endDateMs, not lastTickMs
    const candle = findCandleAtTime(candles[market], endDateMs, resolutionMs);
    const mCandles = candles[market];
    const lastPrice = candle?.c ?? (mCandles.length > 0 ? mCandles[mCandles.length - 1].c : pos.entryPrice);
    const closeSide = pos.side === "long" ? "sell" : "buy";
    const fillPrice = applySlippage(lastPrice, closeSide, slippageBps);
    const fee = calcFee(fillPrice, pos.size, feeBps);

    // Match engine: only subtract exit fee
    const realizedPnl = pos.side === "long"
      ? (fillPrice - pos.entryPrice) * pos.size - fee
      : (pos.entryPrice - fillPrice) * pos.size - fee;

    cash += pos.entryPrice * pos.size + realizedPnl;

    trades.push({
      market,
      action: "close",
      side: closeSide,
      size: pos.size,
      price: fillPrice,
      fee,
      realizedPnl,
      tickIndex: totalTicks - 1,
      time: lastTickMs,
      reasoning: "Force-close at backtest end",
    });
  }
  positions.clear();

  // Compute final equity
  const finalEquity = cash;

  // Compute metrics — must match engine formulas exactly
  const closeTrades = trades.filter(t => t.action === "close");
  const winningTrades = closeTrades.filter(t => t.realizedPnl > 0).length;
  const losingTrades = closeTrades.filter(t => t.realizedPnl <= 0).length;
  const totalPnl = closeTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
  // Match engine: return% = (finalEquity - startingEquity) / startingEquity * 100
  // This captures ALL costs including entry fees, not just exit fees in totalPnl
  const returnPct = startingEquity > 0 ? ((finalEquity - startingEquity) / startingEquity) * 100 : 0;
  const winRate = closeTrades.length > 0 ? (winningTrades / closeTrades.length) * 100 : 0;
  const avgTradePnl = closeTrades.length > 0 ? totalPnl / closeTrades.length : 0;

  return {
    trades,
    equityPoints,
    metrics: {
      returnPct,
      totalPnl,
      winRate,
      maxDrawdownPct,
      totalTrades: trades.length, // Match engine: count all trades (opens + closes)
      winningTrades,
      losingTrades,
      avgTradePnl,
      finalEquity,
    },
  };
}

function emptyMetrics(startingEquity: number): WhatIfMetrics {
  return {
    returnPct: 0,
    totalPnl: 0,
    winRate: 0,
    maxDrawdownPct: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    avgTradePnl: 0,
    finalEquity: startingEquity,
  };
}
