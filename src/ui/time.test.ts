import { describe, expect, it } from "vitest";
import { clampTime, clock, parseAt, stepOrigin } from "./time";

describe("parseAt", () => {
  it("reads a time in nanoseconds", () => {
    expect(parseAt("10335389000000")).toBe(10_335_389_000_000);
    expect(parseAt("1.5e9")).toBe(1.5e9);
  });

  it("starts at the beginning of the day when there is no time", () => {
    expect(parseAt(null)).toBe(0);
    expect(parseAt("")).toBe(0);
  });

  it("starts at the beginning of the day for anything that is not a finite number", () => {
    for (const raw of ["ten", "10:00", "NaN", "Infinity", "-Infinity", "1e400"]) expect(parseAt(raw)).toBe(0);
  });

  it("does not go before the first message", () => {
    expect(parseAt("-5")).toBe(0);
    expect(parseAt("-1e12")).toBe(0);
  });
});

describe("clampTime", () => {
  it("keeps a time within the day", () => {
    expect(clampTime(5, 10)).toBe(5);
    expect(clampTime(-1, 10)).toBe(0);
    expect(clampTime(Number.MAX_SAFE_INTEGER, 10)).toBe(10);
  });
});

describe("stepOrigin", () => {
  const SECOND = 1e9;

  it("puts a step on the clock, at or less than a step before the first message", () => {
    for (const ns of [0, 1, 999_999_999, 1e9, 10_335_389_000_000, 23_400_000_000_001]) {
      const min = stepOrigin(ns, SECOND);
      expect((ns - min) % SECOND).toBe(0);
      expect(min).toBeLessThanOrEqual(0);
      expect(min).toBeGreaterThan(-SECOND);
    }
  });

  it("starts at the first message when the clock is a whole number of steps after it", () => {
    expect(stepOrigin(0, SECOND)).toBe(0);
    expect(stepOrigin(42e9, SECOND)).toBe(0);
  });

  it("keeps the clock to the millisecond rather than a whole second from the first message", () => {
    // A day whose first message came at 04:00:00.389 ET (08:00:00.389 UTC).
    const start = Date.UTC(2026, 8, 24, 8, 0, 0, 389);
    const tenAm = 21_599_611_000_000;
    expect(clock(start, tenAm)).toBe("10:00:00.000");
    const min = stepOrigin(tenAm, SECOND);
    // A slider counts steps from its minimum: the value it keeps, and the
    // one a key press moves to, as React Aria rounds them.
    const kept = Math.round((tenAm - min) / SECOND) * SECOND + min;
    expect(clock(start, kept)).toBe("10:00:00.000");
    expect(clock(start, kept + SECOND)).toBe("10:00:01.000");
    // From the first message, as before, the same clock rounds elsewhere.
    expect(clock(start, Math.round(tenAm / SECOND) * SECOND)).toBe("10:00:00.389");
  });
});
