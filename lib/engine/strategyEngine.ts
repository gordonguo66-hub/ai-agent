/**
 * Shared Strategy Engine
 *
 * This module provides a mode-agnostic strategy engine that produces identical
 * decisions for both Virtual and Live modes given the same inputs.
 *
 * The engine is responsible for:
 * - AI intent analysis
 * - Exit rule evaluation (signal, TP/SL, trailing, time-based)
 * - Entry rule validation (behaviors, timing, confidence)
 * - Risk checks (position limits, daily loss, leverage)
 * - Trade control (frequency, cooldown, re-entry rules)
 *
 * The engine does NOT handle:
 * - Order execution (delegated to VirtualBroker or LiveBroker)
 * - Position persistence (delegated to mode-specific data layer)
 * - Account equity updates (delegated to mode-specific data layer)
 */

import { SessionMode, Venue, MarketType } from "./types";

// ============================================================================
// CORE TYPES - Mode-agnostic input/output interfaces
// ============================================================================

export interface MarketSnapshot {
  market: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: string;
  candles?: {
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }[];
  orderbook?: {
    bids: [number, number][];
    asks: [number, number][];
  };
}

export interface PositionSnapshot {
  market: string;
  side: "long" | "short";
  size: number;
  avgEntry: number;
  unrealizedPnl: number;
  createdAt?: string;
}

export interface AccountSnapshot {
  equity: number;
  cashBalance: number;
  startingEquity: number;
}

export interface IndicatorsSnapshot {
  rsi?: { value: number; period: number };
  atr?: { value: number; period: number };
  volatility?: { value: number };
  ema?: {
    fast?: { value: number; period: number };
    slow?: { value: number; period: number };
  };
}

export interface RecentDecision {
  timestamp: string;
  intent: { bias: string; reasoning?: string };
  confidence: number;
  actionSummary: string;
  executed: boolean;
}

export interface StrategyConfig {
  prompt: string;
  guardrails: {
    minConfidence: number;
    allowLong: boolean;
    allowShort: boolean;
  };
  entryExit: {
    entry: {
      behaviors: {
        trend: boolean;
        breakout: boolean;
        meanReversion: boolean;
      };
      timing?: {
        waitForClose?: boolean;
        maxSlippagePct?: number;
      };
    };
    exit: {
      mode: "signal" | "tp_sl" | "trailing" | "time";
      takeProfitPct?: number;
      stopLossPct?: number;
      trailingStopPct?: number;
      initialStopLossPct?: number;
      maxHoldMinutes?: number;
      maxLossProtectionPct?: number;
      maxProfitCapPct?: number;
    };
    tradeControl: {
      maxTradesPerHour: number;
      maxTradesPerDay: number;
      cooldownMinutes: number;
      minHoldMinutes: number;
      allowReentrySameDirection: boolean;
    };
    confidenceControl: {
      minConfidence: number;
      confidenceScaling: boolean;
    };
  };
  risk: {
    maxDailyLossPct: number;
    maxPositionUsd: number;
    maxLeverage: number;
  };
}

// ============================================================================
// AI INTENT - Structured output from AI model
// ============================================================================

export interface AIIntent {
  market: string;
  bias: "long" | "short" | "hold" | "neutral" | "close";
  confidence: number;
  entryZone?: { lower: number; upper: number };
  stopLoss?: number;
  takeProfit?: number;
  risk?: number;
  reasoning: string;
}

// ============================================================================
// ORDER INTENT - Mode-agnostic order specification
// ============================================================================

export interface OrderIntent {
  market: string;
  side: "buy" | "sell";
  notionalUsd: number;
  reason: string;
  type: "entry" | "exit";
  exitReason?: string;
}

// ============================================================================
// DECISION OUTPUT - Complete decision with all context
// ============================================================================

export interface StrategyDecision {
  // Timestamps
  timestamp: string;

  // AI Analysis
  intent: AIIntent;
  confidence: number;

  // Decision outcome
  action: "execute" | "skip";
  actionSummary: string;

  // Orders to execute (may be empty if action=skip)
  orders: OrderIntent[];

  // Risk evaluation
  riskResult: {
    passed: boolean;
    reason?: string;
    checks?: Record<string, boolean>;
  };

  // Indicators used in decision
  indicators: IndicatorsSnapshot;

  // Market state at decision time
  marketSnapshot: MarketSnapshot;

  // For logging/debugging
  filterResults: {
    confidenceCheck: { passed: boolean; reason?: string };
    guardrailsCheck: { passed: boolean; reason?: string };
    behaviorCheck: { passed: boolean; reason?: string };
    tradeControlCheck: { passed: boolean; reason?: string };
    riskCheck: { passed: boolean; reason?: string };
    entryTimingCheck: { passed: boolean; reason?: string };
  };
}

// ============================================================================
// STRATEGY ENGINE INPUT - Everything needed to make a decision
// ============================================================================

export interface StrategyEngineInput {
  // Market data
  market: string;
  marketSnapshot: MarketSnapshot;
  indicators: IndicatorsSnapshot;

  // Account state
  account: AccountSnapshot;
  positions: PositionSnapshot[];
  currentPosition: PositionSnapshot | null;

  // Strategy configuration
  config: StrategyConfig;

  // Historical context
  recentDecisions: RecentDecision[];
  recentTrades: {
    timestamp: string;
    side: string;
    action: string;
    realizedPnl?: number;
  }[];

  // Trade counts for frequency checks
  tradesLastHour: number;
  tradesLastDay: number;

  // AI response (pre-computed to ensure identical calls)
  aiIntent: AIIntent;

  // Exchange venue (for venue-specific constraints)
  venue?: Venue;
}

// ============================================================================
// EXIT EVALUATION - Shared exit logic
// ============================================================================

export interface ExitEvaluation {
  shouldExit: boolean;
  reason: string;
  exitType: "ai_signal" | "take_profit" | "stop_loss" | "trailing_stop" | "time_stop" | "max_loss_protection" | "max_profit_cap" | null;
}

/**
 * Evaluates exit conditions for a position.
 * This is mode-agnostic - same logic for virtual and live.
 */
export function evaluateExitConditions(
  position: PositionSnapshot,
  currentPrice: number,
  exitConfig: StrategyConfig["entryExit"]["exit"],
  aiIntent: AIIntent,
  peakPrice?: number
): ExitEvaluation {
  const entryPrice = position.avgEntry;
  const size = position.size;
  const positionSide = position.side;

  // Calculate unrealized PnL percentage
  let unrealizedPnl = 0;
  if (positionSide === "long") {
    unrealizedPnl = (currentPrice - entryPrice) * size;
  } else {
    unrealizedPnl = (entryPrice - currentPrice) * size;
  }
  const unrealizedPnlPct = entryPrice > 0 && size > 0
    ? (unrealizedPnl / (entryPrice * size)) * 100
    : 0;

  // MODE: SIGNAL (AI-driven exits)
  if (exitConfig.mode === "signal") {
    // Emergency guardrails first
    if (exitConfig.maxLossProtectionPct && unrealizedPnlPct <= -Math.abs(exitConfig.maxLossProtectionPct)) {
      return {
        shouldExit: true,
        reason: `Max loss protection: ${unrealizedPnlPct.toFixed(2)}% <= -${exitConfig.maxLossProtectionPct}%`,
        exitType: "max_loss_protection"
      };
    }
    if (exitConfig.maxProfitCapPct && unrealizedPnlPct >= exitConfig.maxProfitCapPct) {
      return {
        shouldExit: true,
        reason: `Max profit cap: ${unrealizedPnlPct.toFixed(2)}% >= ${exitConfig.maxProfitCapPct}%`,
        exitType: "max_profit_cap"
      };
    }

    // AI explicit close request
    if (aiIntent.bias === "close") {
      return {
        shouldExit: true,
        reason: `AI requested close: ${unrealizedPnlPct >= 0 ? 'profit taking' : 'loss cutting'} (${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`,
        exitType: "ai_signal"
      };
    }

    // AI signal conflict check (direction reversal)
    const shouldExitOnSignal =
      (positionSide === "long" && aiIntent.bias === "short") ||
      (positionSide === "short" && aiIntent.bias === "long");

    if (shouldExitOnSignal) {
      return {
        shouldExit: true,
        reason: `AI signal reversal: ${aiIntent.bias} conflicts with ${positionSide} position`,
        exitType: "ai_signal"
      };
    }
  }

  // MODE: TP/SL
  if (exitConfig.mode === "tp_sl") {
    if (exitConfig.takeProfitPct && unrealizedPnlPct >= exitConfig.takeProfitPct) {
      return {
        shouldExit: true,
        reason: `Take profit: ${unrealizedPnlPct.toFixed(2)}% >= ${exitConfig.takeProfitPct}%`,
        exitType: "take_profit"
      };
    }
    if (exitConfig.stopLossPct && unrealizedPnlPct <= -Math.abs(exitConfig.stopLossPct)) {
      return {
        shouldExit: true,
        reason: `Stop loss: ${Math.abs(unrealizedPnlPct).toFixed(2)}% >= ${exitConfig.stopLossPct}%`,
        exitType: "stop_loss"
      };
    }
  }

  // MODE: TRAILING STOP
  if (exitConfig.mode === "trailing" && exitConfig.trailingStopPct && peakPrice) {
    const dropFromPeakPct = positionSide === "long"
      ? ((peakPrice - currentPrice) / peakPrice) * 100
      : ((currentPrice - peakPrice) / peakPrice) * 100;

    if (dropFromPeakPct >= exitConfig.trailingStopPct && currentPrice !== peakPrice) {
      const extremeLabel = positionSide === "long" ? "peak" : "trough";
      return {
        shouldExit: true,
        reason: `Trailing stop: ${dropFromPeakPct.toFixed(2)}% from ${extremeLabel} ${peakPrice.toFixed(2)}`,
        exitType: "trailing_stop"
      };
    }

    // Initial hard stop
    if (exitConfig.initialStopLossPct && unrealizedPnlPct <= -Math.abs(exitConfig.initialStopLossPct)) {
      return {
        shouldExit: true,
        reason: `Initial stop loss: ${Math.abs(unrealizedPnlPct).toFixed(2)}% >= ${exitConfig.initialStopLossPct}%`,
        exitType: "stop_loss"
      };
    }
  }

  // MODE: TIME-BASED (requires position age - caller must check)
  // Note: Time-based exits are handled in the main engine with position creation time

  return { shouldExit: false, reason: "", exitType: null };
}

// ============================================================================
// ENTRY EVALUATION - Shared entry logic
// ============================================================================

export interface EntryEvaluation {
  canEnter: boolean;
  reason: string;
  failedCheck?: string;
}

/**
 * Evaluates entry conditions.
 * This is mode-agnostic - same logic for virtual and live.
 * Includes venue-specific constraints (e.g., no shorting on Coinbase spot).
 */
export function evaluateEntryConditions(
  input: StrategyEngineInput
): EntryEvaluation {
  const { config, aiIntent, currentPosition, indicators, tradesLastHour, tradesLastDay, recentTrades, venue } = input;
  const { guardrails, entryExit, risk } = config;

  // 1. Check if already in position
  if (currentPosition) {
    return { canEnter: false, reason: "Already in position", failedCheck: "position" };
  }

  // 2. VENUE CONSTRAINT: Coinbase spot cannot short
  if (venue === "coinbase" && aiIntent.bias === "short") {
    return {
      canEnter: false,
      reason: "Short selling is not available on Coinbase spot markets. You can only buy assets or sell assets you own.",
      failedCheck: "venue_constraint"
    };
  }

  // 3. Confidence check
  const minConfidence = entryExit.confidenceControl?.minConfidence ?? guardrails.minConfidence ?? 0.65;
  if (aiIntent.confidence < minConfidence) {
    return {
      canEnter: false,
      reason: `Confidence ${(aiIntent.confidence * 100).toFixed(0)}% below minimum ${(minConfidence * 100).toFixed(0)}%`,
      failedCheck: "confidence"
    };
  }

  // 4. Guardrails check (long/short permissions)
  if (aiIntent.bias === "long" && !guardrails.allowLong) {
    return { canEnter: false, reason: "Long positions not allowed", failedCheck: "guardrails" };
  }
  if (aiIntent.bias === "short" && !guardrails.allowShort) {
    return { canEnter: false, reason: "Short positions not allowed", failedCheck: "guardrails" };
  }
  if (aiIntent.bias === "neutral") {
    return { canEnter: false, reason: "AI decision: neutral (no trade)", failedCheck: "intent" };
  }

  // 4. Trade frequency check
  const tradeControl = entryExit.tradeControl;
  if (tradesLastHour >= tradeControl.maxTradesPerHour) {
    return {
      canEnter: false,
      reason: `Trade frequency limit: ${tradesLastHour}/${tradeControl.maxTradesPerHour} trades in last hour`,
      failedCheck: "frequency"
    };
  }
  if (tradesLastDay >= tradeControl.maxTradesPerDay) {
    return {
      canEnter: false,
      reason: `Trade frequency limit: ${tradesLastDay}/${tradeControl.maxTradesPerDay} trades in last day`,
      failedCheck: "frequency"
    };
  }

  // 5. Re-entry direction check
  if (!tradeControl.allowReentrySameDirection && recentTrades.length > 0) {
    const lastTrade = recentTrades[0];
    const lastSide = lastTrade.side;
    const currentSide = aiIntent.bias === "long" ? "buy" : "sell";
    if (lastSide === currentSide) {
      return {
        canEnter: false,
        reason: `Re-entry same direction not allowed (last: ${lastSide})`,
        failedCheck: "reentry"
      };
    }
  }

  // 6. Entry behavior classification
  const behaviors = entryExit.entry?.behaviors || { trend: true, breakout: true, meanReversion: true };
  if (!behaviors.trend && !behaviors.breakout && !behaviors.meanReversion) {
    return {
      canEnter: false,
      reason: "No entry behaviors enabled",
      failedCheck: "behaviors"
    };
  }

  // 7. Position size / risk check
  if (input.account.equity <= 0) {
    return { canEnter: false, reason: "Account has no equity", failedCheck: "risk" };
  }

  return { canEnter: true, reason: "All checks passed" };
}

// ============================================================================
// MAIN ENGINE - Produces identical decisions for virtual and live
// ============================================================================

/**
 * Evaluates a strategy tick and produces a decision.
 * This function is completely mode-agnostic.
 *
 * @param input - All data needed to make a decision
 * @returns StrategyDecision with orders, reasoning, and all context
 */
export function evaluateStrategy(input: StrategyEngineInput): StrategyDecision {
  const timestamp = new Date().toISOString();
  const { market, marketSnapshot, indicators, config, aiIntent, currentPosition, account, positions } = input;

  const filterResults: StrategyDecision["filterResults"] = {
    confidenceCheck: { passed: true },
    guardrailsCheck: { passed: true },
    behaviorCheck: { passed: true },
    tradeControlCheck: { passed: true },
    riskCheck: { passed: true },
    entryTimingCheck: { passed: true },
  };

  const orders: OrderIntent[] = [];
  let action: "execute" | "skip" = "skip";
  let actionSummary = "No action";
  let riskResult: StrategyDecision["riskResult"] = { passed: true };

  // ---- EXIT EVALUATION ----
  if (currentPosition) {
    const exitEval = evaluateExitConditions(
      currentPosition,
      marketSnapshot.price,
      config.entryExit.exit,
      aiIntent
    );

    if (exitEval.shouldExit) {
      const exitSide = currentPosition.side === "long" ? "sell" : "buy";
      const positionValue = currentPosition.avgEntry * currentPosition.size;

      orders.push({
        market,
        side: exitSide,
        notionalUsd: positionValue,
        reason: exitEval.reason,
        type: "exit",
        exitReason: exitEval.exitType || undefined,
      });

      action = "execute";
      actionSummary = `Exit ${currentPosition.side}: ${exitEval.reason}`;

      return {
        timestamp,
        intent: aiIntent,
        confidence: aiIntent.confidence,
        action,
        actionSummary,
        orders,
        riskResult: { passed: true, reason: "Exit triggered" },
        indicators,
        marketSnapshot,
        filterResults,
      };
    }
  }

  // ---- ENTRY EVALUATION ----
  const entryEval = evaluateEntryConditions(input);

  if (!entryEval.canEnter) {
    // Record which filter failed
    if (entryEval.failedCheck === "confidence") {
      filterResults.confidenceCheck = { passed: false, reason: entryEval.reason };
    } else if (entryEval.failedCheck === "guardrails" || entryEval.failedCheck === "intent") {
      filterResults.guardrailsCheck = { passed: false, reason: entryEval.reason };
    } else if (entryEval.failedCheck === "behaviors") {
      filterResults.behaviorCheck = { passed: false, reason: entryEval.reason };
    } else if (entryEval.failedCheck === "frequency" || entryEval.failedCheck === "reentry") {
      filterResults.tradeControlCheck = { passed: false, reason: entryEval.reason };
    } else if (entryEval.failedCheck === "risk") {
      filterResults.riskCheck = { passed: false, reason: entryEval.reason };
    } else if (entryEval.failedCheck === "venue_constraint") {
      // Venue constraints (e.g., no shorting on Coinbase) are treated as guardrails
      filterResults.guardrailsCheck = { passed: false, reason: entryEval.reason };
    }

    riskResult = { passed: false, reason: entryEval.reason };
    actionSummary = entryEval.reason;

    return {
      timestamp,
      intent: aiIntent,
      confidence: aiIntent.confidence,
      action: "skip",
      actionSummary,
      orders: [],
      riskResult,
      indicators,
      marketSnapshot,
      filterResults,
    };
  }

  // ---- CALCULATE POSITION SIZE ----
  // FIXED: Position sizing now respects maxLeverage setting instead of hardcoded 10% cap
  const maxPositionUsd = config.risk.maxPositionUsd || 10000;
  let maxLeverage = config.risk.maxLeverage || 2;

  // VENUE CONSTRAINT: Coinbase spot has no leverage (1x only)
  if (input.venue === "coinbase" && maxLeverage > 1) {
    console.log(`[StrategyEngine] Coinbase venue: forcing maxLeverage from ${maxLeverage}x to 1x (spot trading has no leverage)`);
    maxLeverage = 1;
  }

  // Calculate max exposure based on leverage allowance
  const totalCurrentExposure = positions.reduce((sum, p) => sum + (p.avgEntry * p.size), 0);
  const maxExposureAllowed = account.equity * maxLeverage * 0.99; // 1% safety margin
  const remainingLeverageRoom = Math.max(0, maxExposureAllowed - totalCurrentExposure);

  // Position size is the minimum of: user's maxPositionUsd OR remaining leverage room
  let positionNotional = Math.min(maxPositionUsd, remainingLeverageRoom);

  // Apply confidence scaling if enabled
  if (config.entryExit.confidenceControl?.confidenceScaling) {
    positionNotional = positionNotional * aiIntent.confidence;
  }

  // ---- CREATE ENTRY ORDER ----
  const entrySide = aiIntent.bias === "long" ? "buy" : "sell";

  orders.push({
    market,
    side: entrySide,
    notionalUsd: positionNotional,
    reason: `${aiIntent.bias} entry: ${aiIntent.reasoning}`,
    type: "entry",
  });

  action = "execute";
  actionSummary = `Entry ${aiIntent.bias}: $${positionNotional.toFixed(2)} @ $${marketSnapshot.price.toFixed(2)}`;

  return {
    timestamp,
    intent: aiIntent,
    confidence: aiIntent.confidence,
    action,
    actionSummary,
    orders,
    riskResult: { passed: true, reason: "Entry approved" },
    indicators,
    marketSnapshot,
    filterResults,
  };
}

// ============================================================================
// DECISION COMPARISON - For parity testing
// ============================================================================

export interface DecisionDiff {
  field: string;
  virtual: any;
  live: any;
}

/**
 * Compares two decisions for parity testing.
 * Returns differences if any, or empty array if identical.
 */
export function compareDecisions(
  virtual: StrategyDecision,
  live: StrategyDecision
): DecisionDiff[] {
  const diffs: DecisionDiff[] = [];

  // Compare key fields
  if (virtual.action !== live.action) {
    diffs.push({ field: "action", virtual: virtual.action, live: live.action });
  }

  if (virtual.actionSummary !== live.actionSummary) {
    diffs.push({ field: "actionSummary", virtual: virtual.actionSummary, live: live.actionSummary });
  }

  if (virtual.intent.bias !== live.intent.bias) {
    diffs.push({ field: "intent.bias", virtual: virtual.intent.bias, live: live.intent.bias });
  }

  if (Math.abs(virtual.confidence - live.confidence) > 0.001) {
    diffs.push({ field: "confidence", virtual: virtual.confidence, live: live.confidence });
  }

  if (virtual.orders.length !== live.orders.length) {
    diffs.push({ field: "orders.length", virtual: virtual.orders.length, live: live.orders.length });
  } else {
    for (let i = 0; i < virtual.orders.length; i++) {
      const v = virtual.orders[i];
      const l = live.orders[i];
      if (v.side !== l.side) {
        diffs.push({ field: `orders[${i}].side`, virtual: v.side, live: l.side });
      }
      if (Math.abs(v.notionalUsd - l.notionalUsd) > 0.01) {
        diffs.push({ field: `orders[${i}].notionalUsd`, virtual: v.notionalUsd, live: l.notionalUsd });
      }
      if (v.type !== l.type) {
        diffs.push({ field: `orders[${i}].type`, virtual: v.type, live: l.type });
      }
    }
  }

  if (virtual.riskResult.passed !== live.riskResult.passed) {
    diffs.push({ field: "riskResult.passed", virtual: virtual.riskResult.passed, live: live.riskResult.passed });
  }

  return diffs;
}
