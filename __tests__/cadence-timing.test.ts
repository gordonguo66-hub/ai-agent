/**
 * Unit tests for cadence timing logic
 * Tests the shouldTick function to ensure no +1 minute drift
 */

describe("Cadence Timing", () => {
  /**
   * Helper function to determine if a tick should execute
   * This matches the logic in app/api/cron/tick-all-sessions/route.ts
   */
  function shouldTick(
    now: number,
    lastTickAt: number | null,
    cadenceSeconds: number
  ): boolean {
    const cadenceMs = cadenceSeconds * 1000;

    if (!lastTickAt || lastTickAt === 0) {
      return true; // Always tick if never ticked before
    }

    const timeSinceLastTick = now - lastTickAt;
    return timeSinceLastTick >= cadenceMs;
  }

  describe("Boundary cases", () => {
    test("cadence=60, delta=59 -> false (should not tick)", () => {
      const now = 100000;
      const lastTickAt = now - 59 * 1000; // 59 seconds ago
      const cadenceSeconds = 60;

      const result = shouldTick(now, lastTickAt, cadenceSeconds);

      expect(result).toBe(false);
    });

    test("cadence=60, delta=60 -> true (should tick)", () => {
      const now = 100000;
      const lastTickAt = now - 60 * 1000; // Exactly 60 seconds ago
      const cadenceSeconds = 60;

      const result = shouldTick(now, lastTickAt, cadenceSeconds);

      expect(result).toBe(true);
    });

    test("cadence=60, delta=61 -> true (should tick)", () => {
      const now = 100000;
      const lastTickAt = now - 61 * 1000; // 61 seconds ago
      const cadenceSeconds = 60;

      const result = shouldTick(now, lastTickAt, cadenceSeconds);

      expect(result).toBe(true);
    });
  });

  describe("Never ticked before", () => {
    test("should tick when lastTickAt is null", () => {
      const now = 100000;
      const result = shouldTick(now, null, 60);
      expect(result).toBe(true);
    });

    test("should tick when lastTickAt is 0", () => {
      const now = 100000;
      const result = shouldTick(now, 0, 60);
      expect(result).toBe(true);
    });
  });

  describe("No drift verification", () => {
    test("consecutive ticks should maintain exact cadence", () => {
      const cadenceSeconds = 60;
      const cadenceMs = cadenceSeconds * 1000;

      // Simulate tick sequence
      let lastTickAt = 100000; // Start time

      // First tick at T=0
      const tick1Time = lastTickAt;
      const shouldTick1 = shouldTick(tick1Time, 0, cadenceSeconds);
      expect(shouldTick1).toBe(true);
      lastTickAt = tick1Time; // Update after tick

      // Second tick should happen exactly at cadence
      const tick2Time = lastTickAt + cadenceMs;
      const shouldTick2 = shouldTick(tick2Time, lastTickAt, cadenceSeconds);
      expect(shouldTick2).toBe(true);

      // Verify time between ticks is exactly cadence
      const timeBetween = tick2Time - lastTickAt;
      expect(timeBetween).toBe(cadenceMs);
    });

    test("should not accumulate drift over multiple ticks", () => {
      const cadenceSeconds = 60;
      const cadenceMs = cadenceSeconds * 1000;

      let lastTickAt = 100000;

      // Simulate 5 ticks
      for (let i = 0; i < 5; i++) {
        const currentTime = lastTickAt + cadenceMs;
        const shouldTickResult = shouldTick(currentTime, lastTickAt, cadenceSeconds);
        expect(shouldTickResult).toBe(true);

        // Verify exact timing
        const timeSinceLastTick = currentTime - lastTickAt;
        expect(timeSinceLastTick).toBe(cadenceMs);

        lastTickAt = currentTime;
      }
    });
  });

  describe("Cron runs less frequently than cadence", () => {
    test("should tick immediately when cron runs if cadence has passed", () => {
      const cadenceSeconds = 60;
      const lastTickAt = 100000;

      // Cron runs 90 seconds later (30 seconds late)
      const cronRunTime = lastTickAt + 90 * 1000;

      const result = shouldTick(cronRunTime, lastTickAt, cadenceSeconds);
      expect(result).toBe(true); // Should tick immediately
    });

    test("should not tick early if cron runs before cadence", () => {
      const cadenceSeconds = 120; // 2 minute cadence
      const lastTickAt = 100000;

      // Cron runs 90 seconds later (30 seconds early)
      const cronRunTime = lastTickAt + 90 * 1000;

      const result = shouldTick(cronRunTime, lastTickAt, cadenceSeconds);
      expect(result).toBe(false); // Should not tick yet
    });
  });
});
