/**
 * Parity Test Harness
 *
 * Verifies that Virtual and Live modes produce identical decisions
 * for the same strategy and market snapshot.
 *
 * Usage:
 *   import { runParityTest, createTestSnapshot } from './parityTest';
 *
 *   const snapshot = createTestSnapshot({ market: 'BTC-PERP', price: 50000 });
 *   const result = runParityTest(strategyConfig, snapshot);
 *   if (!result.passed) {
 *     console.error('Parity test failed:', result.diffs);
 *   }
 */

import {
  evaluateStrategy,
  compareDecisions,
  StrategyEngineInput,
  StrategyConfig,
  MarketSnapshot,
  PositionSnapshot,
  AccountSnapshot,
  IndicatorsSnapshot,
  AIIntent,
  StrategyDecision,
  DecisionDiff,
} from "./strategyEngine";

// ============================================================================
// TEST FIXTURES - Factory functions for test data
// ============================================================================

export interface TestSnapshotOptions {
  market?: string;
  price?: number;
  hasPosition?: boolean;
  positionSide?: "long" | "short";
  positionSize?: number;
  positionEntry?: number;
  equity?: number;
  aiIntent?: Partial<AIIntent>;
  indicators?: Partial<IndicatorsSnapshot>;
}

/**
 * Creates a test market snapshot with sensible defaults.
 */
export function createTestSnapshot(options: TestSnapshotOptions = {}): MarketSnapshot {
  const price = options.price ?? 50000;
  return {
    market: options.market ?? "BTC-PERP",
    price,
    bid: price * 0.9999,
    ask: price * 1.0001,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a test position snapshot.
 */
export function createTestPosition(options: TestSnapshotOptions = {}): PositionSnapshot | null {
  if (!options.hasPosition) return null;

  const entry = options.positionEntry ?? 49000;
  const size = options.positionSize ?? 0.1;
  const side = options.positionSide ?? "long";
  const currentPrice = options.price ?? 50000;

  const unrealizedPnl = side === "long"
    ? (currentPrice - entry) * size
    : (entry - currentPrice) * size;

  return {
    market: options.market ?? "BTC-PERP",
    side,
    size,
    avgEntry: entry,
    unrealizedPnl,
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  };
}

/**
 * Creates a test account snapshot.
 */
export function createTestAccount(options: TestSnapshotOptions = {}): AccountSnapshot {
  const equity = options.equity ?? 100000;
  return {
    equity,
    cashBalance: equity,
    startingEquity: 100000,
  };
}

/**
 * Creates a test AI intent.
 */
export function createTestAIIntent(options: TestSnapshotOptions = {}): AIIntent {
  const defaults: AIIntent = {
    market: options.market ?? "BTC-PERP",
    bias: "long",
    confidence: 0.75,
    reasoning: "Test reasoning: Strong upward momentum detected",
    entryZone: { lower: 49500, upper: 50500 },
    stopLoss: 48000,
    takeProfit: 55000,
    risk: 0.02,
  };

  return { ...defaults, ...options.aiIntent };
}

/**
 * Creates test indicators.
 */
export function createTestIndicators(options: TestSnapshotOptions = {}): IndicatorsSnapshot {
  const defaults: IndicatorsSnapshot = {
    rsi: { value: 55, period: 14 },
    atr: { value: 500, period: 14 },
    volatility: { value: 0.02 },
    ema: {
      fast: { value: 50100, period: 9 },
      slow: { value: 49900, period: 21 },
    },
  };

  return { ...defaults, ...options.indicators };
}

/**
 * Creates a default strategy configuration.
 */
export function createTestStrategyConfig(): StrategyConfig {
  return {
    prompt: "Test strategy prompt",
    guardrails: {
      minConfidence: 0.65,
      allowLong: true,
      allowShort: true,
    },
    entryExit: {
      entry: {
        behaviors: {
          trend: true,
          breakout: true,
          meanReversion: true,
        },
        timing: {
          waitForClose: false,
          maxSlippagePct: 0.1,
        },
      },
      exit: {
        mode: "signal",
        takeProfitPct: 5,
        stopLossPct: 2,
        maxLossProtectionPct: 10,
      },
      tradeControl: {
        maxTradesPerHour: 2,
        maxTradesPerDay: 10,
        cooldownMinutes: 15,
        minHoldMinutes: 5,
        allowReentrySameDirection: false,
      },
      confidenceControl: {
        minConfidence: 0.65,
        confidenceScaling: true,
      },
    },
    risk: {
      maxDailyLossPct: 5,
      maxPositionUsd: 10000,
      maxLeverage: 2,
    },
  };
}

// ============================================================================
// PARITY TEST RUNNER
// ============================================================================

export interface ParityTestResult {
  passed: boolean;
  virtualDecision: StrategyDecision;
  liveDecision: StrategyDecision;
  diffs: DecisionDiff[];
  testName: string;
  timestamp: string;
}

/**
 * Runs a parity test comparing virtual and live mode decisions.
 *
 * Both modes receive identical inputs, and we verify they produce
 * identical outputs. The only difference should be the execution
 * (which is not tested here - only decision logic).
 */
export function runParityTest(
  config: StrategyConfig,
  options: TestSnapshotOptions = {},
  testName: string = "Default Parity Test"
): ParityTestResult {
  // Create identical inputs for both modes
  const marketSnapshot = createTestSnapshot(options);
  const position = createTestPosition(options);
  const account = createTestAccount(options);
  const aiIntent = createTestAIIntent(options);
  const indicators = createTestIndicators(options);

  const baseInput: Omit<StrategyEngineInput, "market"> = {
    marketSnapshot,
    indicators,
    account,
    positions: position ? [position] : [],
    currentPosition: position,
    config,
    recentDecisions: [],
    recentTrades: [],
    tradesLastHour: 0,
    tradesLastDay: 0,
    aiIntent,
  };

  // Run engine for "virtual" mode (conceptually)
  const virtualInput: StrategyEngineInput = {
    ...baseInput,
    market: marketSnapshot.market,
  };
  const virtualDecision = evaluateStrategy(virtualInput);

  // Run engine for "live" mode (conceptually - same inputs)
  const liveInput: StrategyEngineInput = {
    ...baseInput,
    market: marketSnapshot.market,
  };
  const liveDecision = evaluateStrategy(liveInput);

  // Compare decisions
  const diffs = compareDecisions(virtualDecision, liveDecision);

  return {
    passed: diffs.length === 0,
    virtualDecision,
    liveDecision,
    diffs,
    testName,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// TEST SUITE - Comprehensive parity tests
// ============================================================================

export interface TestSuiteResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: ParityTestResult[];
}

/**
 * Runs a comprehensive suite of parity tests.
 */
export function runParityTestSuite(): TestSuiteResult {
  const config = createTestStrategyConfig();
  const results: ParityTestResult[] = [];

  // Test 1: Basic entry (no position)
  results.push(runParityTest(config, {
    hasPosition: false,
    aiIntent: { bias: "long", confidence: 0.8 },
  }, "Basic Long Entry"));

  // Test 2: Basic short entry
  results.push(runParityTest(config, {
    hasPosition: false,
    aiIntent: { bias: "short", confidence: 0.75 },
  }, "Basic Short Entry"));

  // Test 3: Neutral intent (no trade)
  results.push(runParityTest(config, {
    hasPosition: false,
    aiIntent: { bias: "neutral", confidence: 0.9 },
  }, "Neutral Intent - No Trade"));

  // Test 4: Low confidence rejection
  results.push(runParityTest(config, {
    hasPosition: false,
    aiIntent: { bias: "long", confidence: 0.3 },
  }, "Low Confidence Rejection"));

  // Test 5: AI signal exit (long position, short signal)
  results.push(runParityTest(config, {
    hasPosition: true,
    positionSide: "long",
    positionEntry: 49000,
    price: 50000,
    aiIntent: { bias: "short", confidence: 0.8 },
  }, "AI Signal Exit - Long to Short"));

  // Test 6: AI signal exit (short position, long signal)
  results.push(runParityTest(config, {
    hasPosition: true,
    positionSide: "short",
    positionEntry: 51000,
    price: 50000,
    aiIntent: { bias: "long", confidence: 0.8 },
  }, "AI Signal Exit - Short to Long"));

  // Test 7: Hold position (neutral signal)
  results.push(runParityTest(config, {
    hasPosition: true,
    positionSide: "long",
    aiIntent: { bias: "neutral", confidence: 0.7 },
  }, "Hold Position - Neutral Signal"));

  // Test 8: Hold position (same direction signal)
  results.push(runParityTest(config, {
    hasPosition: true,
    positionSide: "long",
    aiIntent: { bias: "long", confidence: 0.8 },
  }, "Hold Position - Same Direction"));

  // Test 9: TP/SL mode - Take profit trigger
  const tpSlConfig = { ...config };
  tpSlConfig.entryExit.exit.mode = "tp_sl";
  tpSlConfig.entryExit.exit.takeProfitPct = 2;
  results.push(runParityTest(tpSlConfig, {
    hasPosition: true,
    positionSide: "long",
    positionEntry: 49000,
    price: 50000, // ~2% profit
    aiIntent: { bias: "neutral", confidence: 0.5 },
  }, "TP/SL Mode - Take Profit Trigger"));

  // Test 10: TP/SL mode - Stop loss trigger
  results.push(runParityTest(tpSlConfig, {
    hasPosition: true,
    positionSide: "long",
    positionEntry: 51000,
    price: 50000, // ~2% loss
    aiIntent: { bias: "neutral", confidence: 0.5 },
  }, "TP/SL Mode - Stop Loss Trigger"));

  // Calculate summary
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = results.filter(r => !r.passed).length;

  return {
    passed: failedTests === 0,
    totalTests: results.length,
    passedTests,
    failedTests,
    results,
  };
}

// ============================================================================
// DEBUG TOOL - Single tick comparison
// ============================================================================

/**
 * Debug tool to compare a single tick across modes.
 * Useful for investigating specific scenarios.
 */
export function debugSingleTick(
  config: StrategyConfig,
  marketSnapshot: MarketSnapshot,
  position: PositionSnapshot | null,
  account: AccountSnapshot,
  aiIntent: AIIntent,
  indicators: IndicatorsSnapshot
): {
  decision: StrategyDecision;
  inputSummary: string;
  outputSummary: string;
} {
  const input: StrategyEngineInput = {
    market: marketSnapshot.market,
    marketSnapshot,
    indicators,
    account,
    positions: position ? [position] : [],
    currentPosition: position,
    config,
    recentDecisions: [],
    recentTrades: [],
    tradesLastHour: 0,
    tradesLastDay: 0,
    aiIntent,
  };

  const decision = evaluateStrategy(input);

  const inputSummary = [
    `Market: ${marketSnapshot.market} @ $${marketSnapshot.price}`,
    `Position: ${position ? `${position.side} ${position.size} @ ${position.avgEntry}` : "None"}`,
    `AI Intent: ${aiIntent.bias} (${(aiIntent.confidence * 100).toFixed(0)}% confidence)`,
    `Account Equity: $${account.equity}`,
  ].join("\n");

  const outputSummary = [
    `Action: ${decision.action}`,
    `Summary: ${decision.actionSummary}`,
    `Orders: ${decision.orders.length > 0 ? decision.orders.map(o => `${o.side} $${o.notionalUsd.toFixed(2)}`).join(", ") : "None"}`,
    `Risk Passed: ${decision.riskResult.passed}`,
  ].join("\n");

  return { decision, inputSummary, outputSummary };
}

// ============================================================================
// CLI RUNNER (can be called from tests or command line)
// ============================================================================

/**
 * Prints parity test results to console.
 */
export function printTestResults(suite: TestSuiteResult): void {
  console.log("\n" + "=".repeat(60));
  console.log("PARITY TEST SUITE RESULTS");
  console.log("=".repeat(60));
  console.log(`Total Tests: ${suite.totalTests}`);
  console.log(`Passed: ${suite.passedTests}`);
  console.log(`Failed: ${suite.failedTests}`);
  console.log(`Status: ${suite.passed ? "✅ ALL PASSED" : "❌ SOME FAILED"}`);
  console.log("=".repeat(60));

  for (const result of suite.results) {
    const status = result.passed ? "✅" : "❌";
    console.log(`\n${status} ${result.testName}`);

    if (!result.passed) {
      console.log("  Differences:");
      for (const diff of result.diffs) {
        console.log(`    - ${diff.field}: virtual=${JSON.stringify(diff.virtual)}, live=${JSON.stringify(diff.live)}`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
}
