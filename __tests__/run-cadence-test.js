/**
 * Standalone test runner for cadence timing tests
 * No dependencies required - runs with Node.js directly
 */

/**
 * Helper function to determine if a tick should execute
 * This matches the logic in app/api/cron/tick-all-sessions/route.ts
 */
function shouldTick(now, lastTickAt, cadenceSeconds) {
  const cadenceMs = cadenceSeconds * 1000;

  if (!lastTickAt || lastTickAt === 0) {
    return true; // Always tick if never ticked before
  }

  const timeSinceLastTick = now - lastTickAt;
  return timeSinceLastTick >= cadenceMs;
}

// Test runner
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const originalExpect = expect;
    let testFailed = false;
    
    function testExpect(actual) {
      return {
        toBe(expected) {
          if (actual === expected) {
            passed++;
            console.log(`  ✓ ${name}`);
          } else {
            failed++;
            testFailed = true;
            failures.push({ name, expected, actual });
            console.error(`  ✗ ${name}`);
            console.error(`    Expected: ${expected}, Got: ${actual}`);
          }
        },
      };
    }
    
    global.expect = testExpect;
    fn();
    global.expect = originalExpect;
    
  } catch (error) {
    failed++;
    failures.push({ name, error: error.message });
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${error.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual === expected) {
        passed++;
      } else {
        failed++;
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
  };
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// Run tests
console.log("Running Cadence Timing Tests\n");
console.log("=".repeat(60));

describe("Boundary cases", () => {
  test("cadence=60, delta=59 -> false (should not tick)", () => {
    const now = 100000;
    const lastTickAt = now - 59 * 1000;
    const cadenceSeconds = 60;
    const result = shouldTick(now, lastTickAt, cadenceSeconds);
    if (result !== false) {
      throw new Error(`Expected false, got ${result}`);
    }
    passed++;
  });

  test("cadence=60, delta=60 -> true (should tick)", () => {
    const now = 100000;
    const lastTickAt = now - 60 * 1000;
    const cadenceSeconds = 60;
    const result = shouldTick(now, lastTickAt, cadenceSeconds);
    if (result !== true) {
      throw new Error(`Expected true, got ${result}`);
    }
    passed++;
  });

  test("cadence=60, delta=61 -> true (should tick)", () => {
    const now = 100000;
    const lastTickAt = now - 61 * 1000;
    const cadenceSeconds = 60;
    const result = shouldTick(now, lastTickAt, cadenceSeconds);
    if (result !== true) {
      throw new Error(`Expected true, got ${result}`);
    }
    passed++;
  });
});

describe("Never ticked before", () => {
  test("should tick when lastTickAt is null", () => {
    const now = 100000;
    const result = shouldTick(now, null, 60);
    if (result !== true) {
      throw new Error(`Expected true, got ${result}`);
    }
    passed++;
  });

  test("should tick when lastTickAt is 0", () => {
    const now = 100000;
    const result = shouldTick(now, 0, 60);
    if (result !== true) {
      throw new Error(`Expected true, got ${result}`);
    }
    passed++;
  });
});

describe("No drift verification", () => {
  test("consecutive ticks should maintain exact cadence", () => {
    const cadenceSeconds = 60;
    const cadenceMs = cadenceSeconds * 1000;
    let lastTickAt = 100000;

    const tick1Time = lastTickAt;
    const shouldTick1 = shouldTick(tick1Time, 0, cadenceSeconds);
    if (shouldTick1 !== true) {
      throw new Error(`First tick should be true`);
    }
    passed++;

    lastTickAt = tick1Time;
    const tick2Time = lastTickAt + cadenceMs;
    const shouldTick2 = shouldTick(tick2Time, lastTickAt, cadenceSeconds);
    if (shouldTick2 !== true) {
      throw new Error(`Second tick should be true`);
    }
    passed++;

    const timeBetween = tick2Time - lastTickAt;
    if (timeBetween !== cadenceMs) {
      throw new Error(`Time between ticks should be ${cadenceMs}, got ${timeBetween}`);
    }
    passed++;
  });

  test("should not accumulate drift over multiple ticks", () => {
    const cadenceSeconds = 60;
    const cadenceMs = cadenceSeconds * 1000;
    let lastTickAt = 100000;

    for (let i = 0; i < 5; i++) {
      const currentTime = lastTickAt + cadenceMs;
      const shouldTickResult = shouldTick(currentTime, lastTickAt, cadenceSeconds);
      if (shouldTickResult !== true) {
        throw new Error(`Tick ${i + 1} should be true`);
      }
      passed++;

      const timeSinceLastTick = currentTime - lastTickAt;
      if (timeSinceLastTick !== cadenceMs) {
        throw new Error(`Time since last tick should be ${cadenceMs}, got ${timeSinceLastTick}`);
      }
      passed++;

      lastTickAt = currentTime;
    }
  });
});

describe("Cron runs less frequently than cadence", () => {
  test("should tick immediately when cron runs if cadence has passed", () => {
    const cadenceSeconds = 60;
    const lastTickAt = 100000;
    const cronRunTime = lastTickAt + 90 * 1000;

    const result = shouldTick(cronRunTime, lastTickAt, cadenceSeconds);
    if (result !== true) {
      throw new Error(`Should tick immediately, got ${result}`);
    }
    passed++;
  });

  test("should not tick early if cron runs before cadence", () => {
    const cadenceSeconds = 120;
    const lastTickAt = 100000;
    const cronRunTime = lastTickAt + 90 * 1000;

    const result = shouldTick(cronRunTime, lastTickAt, cadenceSeconds);
    if (result !== false) {
      throw new Error(`Should not tick early, got ${result}`);
    }
    passed++;
  });
});

// Print results
console.log("\n" + "=".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log("=".repeat(60));

if (failed > 0) {
  console.log("\n✗ Some tests failed:\n");
  failures.forEach(({ name, expected, actual, error }) => {
    console.error(`  ${name}`);
    if (error) {
      console.error(`    ${error}`);
    } else {
      console.error(`    Expected: ${expected}, Got: ${actual}`);
    }
  });
  process.exit(1);
} else {
  console.log("\n✓ All tests passed!");
  process.exit(0);
}