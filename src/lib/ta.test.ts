import { describe, expect, it } from "vitest";
import { aggregateCandles } from "./data";
import type { Candle } from "./indicators";
import { adx, bollinger, macd, obv, sma, stochastic, supertrend, vwapDaily, volumeDelta } from "./ta";

const bar = (i: number, o: number, h: number, l: number, c: number, v = 100): Candle =>
  ({ time: 1_700_000_000 + i * 60, open: o, high: h, low: l, close: c, volume: v });

/** Steady climb with small noise: should read as a strong up-trend everywhere. */
const uptrend = (n = 120): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const base = 100 + i * 1.0;
    return bar(i, base, base + 1.2, base - 0.4, base + 0.9);
  });
const downtrend = (n = 120): Candle[] => uptrend(n).map((c, i) => bar(i, 400 - c.open, 400 - c.low, 400 - c.high, 400 - c.close));

describe("sma / bollinger", () => {
  it("sma matches hand calculation", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(out.slice(2)).toEqual([2, 3, 4]);
  });
  it("bollinger bands collapse on a constant series and widen with noise", () => {
    const flat = bollinger(new Array(30).fill(10));
    expect(flat.upper[29]).toBeCloseTo(10);
    expect(flat.lower[29]).toBeCloseTo(10);
    const noisy = bollinger(Array.from({ length: 30 }, (_, i) => 10 + (i % 2 ? 1 : -1)));
    expect(noisy.upper[29]).toBeGreaterThan(noisy.mid[29]);
    expect(noisy.lower[29]).toBeLessThan(noisy.mid[29]);
  });
});

describe("macd", () => {
  it("is ~0 on a flat series, positive histogram while accelerating up", () => {
    const flat = macd(new Array(80).fill(50));
    expect(Math.abs(flat.line[79])).toBeLessThan(1e-9);
    const accel = macd(Array.from({ length: 80 }, (_, i) => 50 + i * i * 0.05));
    expect(accel.line[79]).toBeGreaterThan(0);
    expect(accel.hist[79]).toBeGreaterThan(0);
  });
});

describe("adx / stochastic / supertrend", () => {
  it("adx is high and +DI > -DI in an up-trend, mirrored in a down-trend", () => {
    const u = adx(uptrend());
    expect(u.adx[119]).toBeGreaterThan(40);
    expect(u.plusDI[119]).toBeGreaterThan(u.minusDI[119]);
    const d = adx(downtrend());
    expect(d.minusDI[119]).toBeGreaterThan(d.plusDI[119]);
  });
  it("adx stays NaN until enough data", () => {
    expect(adx(uptrend(20)).adx.every(Number.isNaN)).toBe(true);
  });
  it("stochastic reads near 100 in a steady climb and near 0 in a steady fall", () => {
    expect(stochastic(uptrend()).k[119]).toBeGreaterThan(80);
    expect(stochastic(downtrend()).k[119]).toBeLessThan(20);
  });
  it("supertrend follows the trend and sits on the right side of price", () => {
    const up = supertrend(uptrend());
    expect(up.dir[119]).toBe(1);
    expect(up.line[119]).toBeLessThan(uptrend()[119].close);
    const dn = supertrend(downtrend());
    expect(dn.dir[119]).toBe(-1);
    expect(dn.line[119]).toBeGreaterThan(downtrend()[119].close);
  });
});

describe("volume tools", () => {
  it("obv rises with up-closes", () => {
    const o = obv(uptrend(10));
    expect(o[9]).toBe(900);
  });
  it("vwap resets each UTC day and falls back to time-weighting with no volume", () => {
    const day = 86400;
    const c: Candle[] = [
      { time: day * 10 + 60, open: 10, high: 12, low: 8, close: 10, volume: 0 },
      { time: day * 10 + 120, open: 10, high: 12, low: 8, close: 10, volume: 0 },
      { time: day * 11 + 60, open: 50, high: 52, low: 48, close: 50, volume: 0 },
    ];
    const v = vwapDaily(c);
    expect(v[1]).toBeCloseTo(10);
    expect(v[2]).toBeCloseTo(50); // new day, not blended with yesterday
  });
  it("volume delta is buy minus sell, NaN when the feed has no buy volume", () => {
    const d = volumeDelta([
      { ...bar(0, 1, 2, 0, 1, 100), buyVolume: 70 },
      bar(1, 1, 2, 0, 1, 100),
    ]);
    expect(d[0]).toBe(40);
    expect(Number.isNaN(d[1])).toBe(true);
  });
});

describe("aggregateCandles", () => {
  it("merges 1m into 3m with correct OHLCV and drops a leading partial bucket", () => {
    const t0 = 180 * 1000; // aligned to a 3m boundary
    const mk = (i: number, o: number, h: number, l: number, c: number) =>
      ({ time: t0 + i * 60, open: o, high: h, low: l, close: c, volume: 10 }) as Candle;
    const raw = [
      mk(-1, 1, 1, 1, 1), // lone leading candle of the previous bucket -> partial, dropped
      mk(0, 10, 11, 9, 10), mk(1, 10, 15, 10, 14), mk(2, 14, 14, 8, 12),
      mk(3, 12, 13, 12, 13),
    ];
    const out = aggregateCandles(raw, 180, 60);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ time: t0, open: 10, high: 15, low: 8, close: 12, volume: 30 });
    expect(out[1].time).toBe(t0 + 180);
  });
});
