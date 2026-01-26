#!/usr/bin/env npx tsx
/**
 * Parity Test Runner
 *
 * Run with: npx tsx scripts/run-parity-tests.ts
 *
 * This script verifies that Virtual and Live modes produce identical
 * decisions for the same strategy and market snapshot.
 */

import {
  runParityTestSuite,
  runParityTest,
  createTestStrategyConfig,
  printTestResults,
  debugSingleTick,
  createTestSnapshot,
  createTestPosition,
  createTestAccount,
  createTestAIIntent,
  createTestIndicators,
} from "../lib/engine/parityTest";

console.log("🔄 Running Strategy Engine Parity Tests...\n");

// Run the full test suite
const suite = runParityTestSuite();

// Print results
printTestResults(suite);

// Additional debug example
console.log("\n📊 Debug Single Tick Example:");
console.log("-".repeat(40));

const config = createTestStrategyConfig();
const snapshot = createTestSnapshot({ price: 50000 });
const position = createTestPosition({ hasPosition: true, positionSide: "long", positionEntry: 49000, price: 50000 });
const account = createTestAccount();
const intent = createTestAIIntent({ aiIntent: { bias: "short", confidence: 0.8 } });
const indicators = createTestIndicators();

const debug = debugSingleTick(config, snapshot, position, account, intent, indicators);

console.log("\nInput Summary:");
console.log(debug.inputSummary);
console.log("\nOutput Summary:");
console.log(debug.outputSummary);
console.log("\nFull Decision:", JSON.stringify(debug.decision, null, 2));

// Exit with appropriate code
if (!suite.passed) {
  console.error("\n❌ Parity tests FAILED");
  process.exit(1);
} else {
  console.log("\n✅ All parity tests PASSED");
  process.exit(0);
}
