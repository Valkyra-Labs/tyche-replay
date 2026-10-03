import { describe, expect, it } from "vitest";
import { clampTime, parseAt } from "./time";

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
