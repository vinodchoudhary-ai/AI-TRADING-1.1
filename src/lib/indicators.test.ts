import { describe, expect, it } from "vitest";
import { ema, rsi } from "./indicators";

describe("indicators", () => {
  it("ema seeds with SMA and matches hand calc", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[2]).toBeCloseTo(2);
    expect(out[3]).toBeCloseTo(3); // 4*0.5 + 2*0.5
    expect(out[4]).toBeCloseTo(4);
  });
  it("rsi is 100 on a pure uptrend and 0 on a pure downtrend", () => {
    const up = Array.from({ length: 30 }, (_, i) => i);
    expect(rsi(up, 14)[29]).toBe(100);
    expect(rsi([...up].reverse(), 14)[29]).toBeCloseTo(0);
  });
});
