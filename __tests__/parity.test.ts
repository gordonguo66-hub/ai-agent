/**
 * Parity Tests - Verify Virtual and Live modes produce identical decisions
 */

import {
  runParityTestSuite,
  runParityTest,
  createTestStrategyConfig,
  printTestResults,
} from "../lib/engine/parityTest";

describe("Strategy Engine Parity", () => {
  describe("Basic Decision Parity", () => {
    test("Long entry produces identical decisions", () => {
      const config = createTestStrategyConfig();
      const result = runParityTest(config, {
        hasPosition: false,
        aiIntent: { bias: "long", confidence: 0.8 },
      }, "Long Entry");

      expect(result.passed).toBe(true);
      expect(result.diffs).toHaveLength(0);
      expect(result.virtualDecision.action).toBe("execute");
      expect(result.liveDecision.action).toBe("execute");
    });

    test("Short entry produces identical decisions", () => {
      const config = createTestStrategyConfig();
      const result = runParityTest(config, {
        hasPosition: false,
        aiIntent: { bias: "short", confidence: 0.75 },
      }, "Short Entry");

      expect(result.passed).toBe(true);
      expect(result.diffs).toHaveLength(0);
    });

    test("Neutral intent produces identical skip decisions", () => {
      const config = createTestStrategyConfig();
      const result = runParityTest(config, {
        hasPosition: false,
        aiIntent: { bias: "neutral", confidence: 0.9 },
      }, "Neutral Skip");

      expect(result.passed).toBe(true);
      expect(result.virtualDecision.action).toBe("skip");
      expect(result.liveDecision.action).toBe("skip");
    });

    test("Low confidence rejection is identical", () => {
      const config = createTestStrategyConfig();
      const result = runParityTest(config, {
        hasPosition: false,
        aiIntent: { bias: "long", confidence: 0.3 },
      }, "Low Confidence");

      expect(result.passed).toBe(true);
      expect(result.virtualDecision.action).toBe("skip");
      expect(result.virtualDecision.actionSummary).toContain("Confidence");
    });
  });

  describe("Exit Decision Parity", () => {
    test("AI signal exit (long to short) is identical", () => {
      const config = createTestStrategyConfig();
      const result = runParityTest(config, {
        hasPosition: true,
        positionSide: "long",
        positionEntry: 49000,
        price: 50000,
        aiIntent: { bias: "short", confidence: 0.8 },
      }, "Signal Exit Long->Short");

      expect(result.passed).toBe(true);
      expect(result.virtualDecision.action).toBe("execute");
      expect(result.virtualDecision.orders[0].type).toBe("exit");
      expect(result.virtualDecision.orders[0].side).toBe("sell");
    });

    test("AI signal exit (short to long) is identical", () => {
      const config = createTestStrategyConfig();
      const result = runParityTest(config, {
        hasPosition: true,
        positionSide: "short",
        positionEntry: 51000,
        price: 50000,
        aiIntent: { bias: "long", confidence: 0.8 },
      }, "Signal Exit Short->Long");

      expect(result.passed).toBe(true);
      expect(result.virtualDecision.action).toBe("execute");
      expect(result.virtualDecision.orders[0].type).toBe("exit");
      expect(result.virtualDecision.orders[0].side).toBe("buy");
    });

    test("Hold position on neutral signal is identical", () => {
      const config = createTestStrategyConfig();
      const result = runParityTest(config, {
        hasPosition: true,
        positionSide: "long",
        aiIntent: { bias: "neutral", confidence: 0.7 },
      }, "Hold on Neutral");

      expect(result.passed).toBe(true);
      // Should skip (no exit, already in position so no entry)
      expect(result.virtualDecision.action).toBe("skip");
    });

    test("Hold position on same direction signal is identical", () => {
      const config = createTestStrategyConfig();
      const result = runParityTest(config, {
        hasPosition: true,
        positionSide: "long",
        aiIntent: { bias: "long", confidence: 0.8 },
      }, "Hold on Same Direction");

      expect(result.passed).toBe(true);
      expect(result.virtualDecision.action).toBe("skip");
    });
  });

  describe("TP/SL Mode Parity", () => {
    test("Take profit trigger is identical", () => {
      const config = createTestStrategyConfig();
      config.entryExit.exit.mode = "tp_sl";
      config.entryExit.exit.takeProfitPct = 2;

      const result = runParityTest(config, {
        hasPosition: true,
        positionSide: "long",
        positionEntry: 49000,
        price: 50000, // ~2% profit
        aiIntent: { bias: "neutral", confidence: 0.5 },
      }, "TP Trigger");

      expect(result.passed).toBe(true);
      expect(result.virtualDecision.action).toBe("execute");
      expect(result.virtualDecision.orders[0].type).toBe("exit");
    });

    test("Stop loss trigger is identical", () => {
      const config = createTestStrategyConfig();
      config.entryExit.exit.mode = "tp_sl";
      config.entryExit.exit.stopLossPct = 2;

      const result = runParityTest(config, {
        hasPosition: true,
        positionSide: "long",
        positionEntry: 51000,
        price: 50000, // ~2% loss
        aiIntent: { bias: "neutral", confidence: 0.5 },
      }, "SL Trigger");

      expect(result.passed).toBe(true);
      expect(result.virtualDecision.action).toBe("execute");
      expect(result.virtualDecision.orders[0].type).toBe("exit");
    });
  });

  describe("Risk Check Parity", () => {
    test("Long disabled produces identical rejection", () => {
      const config = createTestStrategyConfig();
      config.guardrails.allowLong = false;

      const result = runParityTest(config, {
        hasPosition: false,
        aiIntent: { bias: "long", confidence: 0.9 },
      }, "Long Disabled");

      expect(result.passed).toBe(true);
      expect(result.virtualDecision.action).toBe("skip");
      expect(result.virtualDecision.actionSummary).toContain("Long");
    });

    test("Short disabled produces identical rejection", () => {
      const config = createTestStrategyConfig();
      config.guardrails.allowShort = false;

      const result = runParityTest(config, {
        hasPosition: false,
        aiIntent: { bias: "short", confidence: 0.9 },
      }, "Short Disabled");

      expect(result.passed).toBe(true);
      expect(result.virtualDecision.action).toBe("skip");
      expect(result.virtualDecision.actionSummary).toContain("Short");
    });
  });

  describe("Full Test Suite", () => {
    test("All parity tests pass", () => {
      const suite = runParityTestSuite();

      // Print results for debugging
      if (!suite.passed) {
        printTestResults(suite);
      }

      expect(suite.passed).toBe(true);
      expect(suite.failedTests).toBe(0);
    });
  });
});
