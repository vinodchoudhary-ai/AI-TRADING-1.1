import { describe, expect, it } from "vitest";
import { cleanCandles, mergeCandles } from "./data";
import type { Candle } from "./indicators";

const k = (t: number, close: number): Candle => ({ time: t, open: close, high: close, low: close, close, volume: 1 });
const series = (n: number) => Array.from({ length: n }, (_, i) => k(1000 + i * 60, i));

describe("cleanCandles", () => {
  const ohlc = (t: number, o: number, h: number, l: number, c: number): Candle => ({ time: t, open: o, high: h, low: l, close: c, volume: 1 });

  it("sorts newest-first feeds into strictly increasing time", () => {
    const out = cleanCandles([ohlc(300, 1, 2, 1, 1.5), ohlc(100, 1, 2, 1, 1.5), ohlc(200, 1, 2, 1, 1.5)]);
    expect(out.map((c) => c.time)).toEqual([100, 200, 300]);
  });
  it("drops duplicate timestamps, keeping the last one seen", () => {
    const out = cleanCandles([ohlc(100, 1, 2, 1, 1.1), ohlc(100, 1, 2, 1, 1.9), ohlc(200, 1, 2, 1, 1.5)]);
    expect(out).toHaveLength(2);
    expect(out[0].close).toBe(1.9);
  });
  it("drops candles with missing, zero or impossible prices", () => {
    const out = cleanCandles([
      ohlc(100, 1, 2, 1, 1.5),
      ohlc(200, NaN, 2, 1, 1.5), // missing
      ohlc(300, 0, 2, 0, 1), // zero price
      ohlc(400, 1, 1, 2, 1.5), // high below low
      ohlc(500, 1, 2, 1, 3), // close above high
    ]);
    expect(out.map((c) => c.time)).toEqual([100]);
  });
  it("leaves a clean series untouched", () => {
    const clean = [ohlc(100, 1, 2, 1, 1.5), ohlc(200, 1.5, 2.5, 1, 2)];
    expect(cleanCandles(clean)).toEqual(clean);
  });
});

describe("mergeCandles", () => {
  it("replaces the overlapping tail (the forming candle) and appends new candles", () => {
    const base = series(10); // times 1000..1540, last close 9
    const latest = [k(1000 + 8 * 60, 80), k(1000 + 9 * 60, 90), k(1000 + 10 * 60, 100)];
    const out = mergeCandles(base, latest);
    expect(out).toHaveLength(11);
    expect(out.slice(0, 8)).toEqual(base.slice(0, 8)); // untouched history
    expect(out.slice(8).map((c) => c.close)).toEqual([80, 90, 100]);
  });
  it("keeps the candles strictly increasing in time", () => {
    const out = mergeCandles(series(50), [k(1000 + 48 * 60, 1), k(1000 + 49 * 60, 2), k(1000 + 50 * 60, 3)]);
    for (let i = 1; i < out.length; i++) expect(out[i].time).toBeGreaterThan(out[i - 1].time);
  });
  it("just updates in place when nothing new has closed", () => {
    const base = series(5);
    const out = mergeCandles(base, [k(base[4].time, 99)]);
    expect(out).toHaveLength(5);
    expect(out[4].close).toBe(99);
  });
  it("appends when the new candles start after the end of the series (a gap)", () => {
    const base = series(3);
    const out = mergeCandles(base, [k(base[2].time + 600, 7)]);
    expect(out).toHaveLength(4);
  });
  it("returns the original when there is nothing to merge, and caps the length", () => {
    const base = series(5);
    expect(mergeCandles(base, [])).toBe(base);
    const big = mergeCandles(series(20), [k(1000 + 20 * 60, 1)], 10);
    expect(big).toHaveLength(10);
    expect(big[big.length - 1].close).toBe(1);
  });
});
