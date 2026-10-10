import { describe, expect, it } from "vitest";
import { atr, type Candle } from "../indicators";
import { tenInOne } from "./confluence";
import { buildCtx } from "./ctx";
import { candlePatternAt, doublePatterns } from "./patterns";
import { analyzeStructure, confirmedBy, findSwings, type Swing } from "./structure";
import { activeAt, autoFib, equalLevels, findFvgs, findOrderBlocks, periodLevels, srZonesAt, volumeProfile } from "./zones";

const T0 = 1_700_000_000;
const mk = (i: number, o: number, h: number, l: number, c: number, v = 100, step = 60): Candle =>
  ({ time: T0 + i * step, open: o, high: h, low: l, close: c, volume: v });

/** Candles that walk through the given turning points, `leg` bars per leg, with 0.3 wicks. */
function zigzag(points: number[], leg = 8): Candle[] {
  const out: Candle[] = [];
  let prev = points[0];
  for (let p = 1; p < points.length; p++) {
    for (let k = 1; k <= leg; k++) {
      const close = points[p - 1] + ((points[p] - points[p - 1]) * k) / leg;
      out.push(mk(out.length, prev, Math.max(prev, close) + 0.3, Math.min(prev, close) - 0.3, close));
      prev = close;
    }
  }
  return out;
}

describe("swings and structure", () => {
  const up = zigzag([100, 110, 104, 118, 111, 126, 119, 134]);

  it("finds the turning points", () => {
    const sw = findSwings(up, 3, 3);
    const highs = sw.filter((s) => s.type === "high").map((s) => Math.round(s.price));
    const lows = sw.filter((s) => s.type === "low").map((s) => Math.round(s.price));
    expect(highs).toEqual(expect.arrayContaining([110, 118, 126]));
    expect(lows).toEqual(expect.arrayContaining([104, 111]));
  });

  it("only treats a swing as known `right` bars after it formed", () => {
    const sw: Swing[] = [{ index: 10, price: 5, type: "high" }];
    expect(confirmedBy(sw, 3, 12)).toHaveLength(0);
    expect(confirmedBy(sw, 3, 13)).toHaveLength(1);
  });

  it("labels higher highs / higher lows and reports an up-trend with BOS", () => {
    const st = analyzeStructure(up, findSwings(up, 3, 3), 3);
    expect(st.labels.map((l) => l.label)).toEqual(expect.arrayContaining(["HH", "HL"]));
    expect(st.labels.some((l) => l.label === "LH" || l.label === "LL")).toBe(false);
    expect(st.trend[up.length - 1]).toBe(1);
    const bos = st.events.filter((e) => e.dir === 1);
    expect(bos.length).toBeGreaterThan(1);
    expect(bos.every((e) => e.kind === "BOS" || e === bos[0])).toBe(true);
  });

  it("calls the first break against the trend a change of character", () => {
    const rev = zigzag([100, 110, 104, 118, 111, 126, 119, 98], 8);
    const st = analyzeStructure(rev, findSwings(rev, 3, 3), 3);
    const last = st.events[st.events.length - 1];
    expect(last.dir).toBe(-1);
    expect(last.kind).toBe("CHoCH");
    expect(st.trend[rev.length - 1]).toBe(-1);
  });

  it("an event never refers to data after its own bar", () => {
    const st = analyzeStructure(up, findSwings(up, 3, 3), 3);
    for (const e of st.events) {
      expect(e.index).toBeGreaterThanOrEqual(e.swingIndex + 3);
      expect(up[e.index].close).toBeGreaterThan(e.level);
    }
  });
});

describe("fair value gaps and order blocks", () => {
  it("finds a bullish gap, and closes it when price refills it", () => {
    const c = [
      mk(0, 99, 100, 98, 99.5),
      mk(1, 100, 106, 99.5, 105.5), // big impulse candle
      mk(2, 105.5, 108, 103, 107), // low 103 > candle0 high 100 -> gap [100, 103]
      mk(3, 107, 109, 106, 108),
      mk(4, 108, 108.5, 99, 100), // dips back through 100 -> gap filled
    ];
    const a = new Array(5).fill(2);
    const z = findFvgs(c, a);
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ dir: 1, bottom: 100, top: 103, from: 2, to: 4 });
    expect(activeAt(z[0], 3)).toBe(true);
    expect(activeAt(z[0], 4)).toBe(false);
  });

  it("ignores gaps smaller than a quarter ATR", () => {
    const c = [mk(0, 99, 100, 98, 99.5), mk(1, 100, 101, 99.9, 100.5), mk(2, 100.5, 102, 100.1, 101.5)];
    expect(findFvgs(c, [4, 4, 4])).toHaveLength(0);
  });

  it("builds a demand order block from the last down candle before a bullish break", () => {
    const c = zigzag([100, 110, 104, 118], 8);
    const sw = findSwings(c, 3, 3);
    const st = analyzeStructure(c, sw, 3);
    const obs = findOrderBlocks(c, st);
    const bull = obs.find((z) => z.dir === 1);
    expect(bull).toBeDefined();
    expect(bull!.top).toBeGreaterThan(bull!.bottom);
    expect(bull!.bottom).toBeLessThan(110);
    expect(bull!.from).toBeGreaterThan(c.findIndex((x) => x.close >= 104));
  });
});

describe("support/resistance, liquidity, profile, fib", () => {
  it("clusters nearby swings into a zone and ignores lone ones", () => {
    const sw: Swing[] = [
      { index: 10, price: 100, type: "high" },
      { index: 30, price: 100.3, type: "high" },
      { index: 50, price: 120, type: "low" },
    ];
    const zones = srZonesAt([], sw, 3, 100, 1);
    expect(zones).toHaveLength(1);
    expect(zones[0].strength).toBe(2);
    expect(zones[0].bottom).toBeLessThan(100);
    expect(zones[0].top).toBeGreaterThan(100.3);
  });

  it("does not use swings that were not yet confirmed", () => {
    const sw: Swing[] = [
      { index: 10, price: 100, type: "high" },
      { index: 30, price: 100.2, type: "high" },
    ];
    expect(srZonesAt([], sw, 3, 31, 1)).toHaveLength(0); // second swing confirmed only at 33
    expect(srZonesAt([], sw, 3, 33, 1)).toHaveLength(1);
  });

  it("finds equal highs and equal lows", () => {
    const sw: Swing[] = [
      { index: 5, price: 50, type: "high" }, { index: 20, price: 50.05, type: "high" },
      { index: 8, price: 40, type: "low" }, { index: 25, price: 43, type: "low" },
    ];
    const eq = equalLevels(sw, 3, 100, 0.2);
    expect(eq).toHaveLength(1);
    expect(eq[0].type).toBe("eqh");
  });

  it("previous day / week highs and lows never include the current period", () => {
    const day = 86400;
    const c: Candle[] = [
      { time: day * 100 + 3600, open: 5, high: 10, low: 1, close: 5, volume: 1 },
      { time: day * 100 + 7200, open: 5, high: 12, low: 2, close: 5, volume: 1 },
      { time: day * 101 + 3600, open: 5, high: 99, low: 0, close: 5, volume: 1 },
    ];
    const p = periodLevels(c);
    expect(Number.isNaN(p.pdh[1])).toBe(true);
    expect(p.pdh[2]).toBe(12);
    expect(p.pdl[2]).toBe(1);
  });

  it("volume profile puts the POC where the volume is, and the value area around it", () => {
    const c: Candle[] = [];
    for (let i = 0; i < 40; i++) c.push(mk(i, 100, 100.5, 99.5, 100, 1000)); // heavy at 100
    for (let i = 40; i < 50; i++) c.push(mk(i, 120, 121, 119, 120, 10)); // thin at 120
    const p = volumeProfile(c, 0, 49)!;
    expect(p.volumeBased).toBe(true);
    expect(p.poc).toBeGreaterThan(98);
    expect(p.poc).toBeLessThan(102);
    expect(p.vah).toBeLessThan(110);
    expect(p.val).toBeGreaterThan(97);
  });

  it("falls back to time-at-price when there is no volume", () => {
    const c: Candle[] = [];
    for (let i = 0; i < 30; i++) c.push(mk(i, 100, 100.5, 99.5, 100, 0));
    for (let i = 30; i < 35; i++) c.push(mk(i, 110, 111, 109, 110, 0));
    const p = volumeProfile(c, 0, 34)!;
    expect(p.volumeBased).toBe(false);
    expect(Math.abs(p.poc - 100)).toBeLessThan(3);
  });

  it("computes Fibonacci levels from the latest leg", () => {
    const sw: Swing[] = [
      { index: 10, price: 100, type: "low" },
      { index: 30, price: 120, type: "high" },
    ];
    const f = autoFib(sw, 3, 50)!;
    expect(f.dir).toBe(1);
    expect(f.levels.find((l) => l.ratio === 0.5)!.price).toBeCloseTo(110);
    expect(f.levels.find((l) => l.ratio === 0.618)!.price).toBeCloseTo(107.64, 2);
    expect(f.levels.find((l) => l.ratio === 1.272)!.price).toBeCloseTo(125.44, 2);
    expect(autoFib(sw, 3, 31)).toBeNull(); // the high isn't confirmed yet
  });
});

describe("candle patterns", () => {
  const flatAtr = (n: number, v = 2) => new Array<number>(n).fill(v);

  it("recognises a bullish engulfing candle", () => {
    const c = [mk(0, 10, 10.5, 9.5, 10), mk(1, 10, 10.2, 8.6, 8.8), mk(2, 8.7, 10.8, 8.6, 10.6)];
    expect(candlePatternAt(c, flatAtr(3, 1), 2)).toMatchObject({ name: "Bullish engulfing", dir: 1 });
  });

  it("recognises a hammer and a shooting star", () => {
    const hammer = [mk(0, 10, 11, 9, 10), mk(1, 10, 11, 9, 10), mk(2, 10, 10.2, 7.5, 10.1)];
    expect(candlePatternAt(hammer, flatAtr(3, 1), 2)!.dir).toBe(1);
    const star = [mk(0, 10, 11, 9, 10), mk(1, 10, 11, 9, 10), mk(2, 10, 12.7, 9.9, 10.1)];
    expect(candlePatternAt(star, flatAtr(3, 1), 2)!.dir).toBe(-1);
  });

  it("returns nothing for an ordinary candle", () => {
    const c = [mk(0, 10, 11, 9, 10.5), mk(1, 10.5, 11.5, 10, 11), mk(2, 11, 12, 10.6, 11.6)];
    expect(candlePatternAt(c, flatAtr(3, 1), 2)).toBeNull();
  });

  it("finds a double top", () => {
    const c = zigzag([100, 120, 105, 120.1, 100], 8);
    const sw = findSwings(c, 3, 3);
    const dp = doublePatterns(c, sw, 3, atr(c, 5));
    expect(dp.some((p) => p.name === "Double top" && p.dir === -1)).toBe(true);
  });
});

describe("ten indicators in one", () => {
  const trend = (sign: 1 | -1) =>
    Array.from({ length: 260 }, (_, i) => {
      const b = sign === 1 ? 100 + i : 500 - i;
      return sign === 1 ? mk(i, b, b + 1.2, b - 0.4, b + 0.9) : mk(i, b, b + 0.4, b - 1.2, b - 0.9);
    });

  it("votes bullish, never bearish, in a clean up-trend; a flat MACD abstains instead of voting on rounding noise", () => {
    const r = tenInOne(buildCtx(trend(1)), 259);
    expect(r.bullish).toBeGreaterThanOrEqual(7);
    expect(r.bearish).toBe(0);
    expect(r.votes.find((v) => v.name === "MACD histogram")!.vote).toBe(0);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.strength).toBe("strong");
  });

  it("is bearish in a clean down-trend and scores negative", () => {
    const r = tenInOne(buildCtx(trend(-1)), 259);
    expect(r.bearish).toBeGreaterThanOrEqual(7);
    expect(r.bullish).toBe(0);
    expect(r.score).toBeLessThanOrEqual(-70);
  });

  it("an accelerating up-trend also gets the MACD votes", () => {
    const c = Array.from({ length: 260 }, (_, i) => {
      const b = 100 + i + i * i * 0.02;
      return mk(i, b, b + 1.2, b - 0.4, b + 0.9);
    });
    const r = tenInOne(buildCtx(c), 259);
    expect(r.votes.find((v) => v.name === "MACD histogram")!.vote).toBe(1);
    expect(r.bullish).toBeGreaterThanOrEqual(8);
    expect(r.bearish).toBe(0);
  });

  it("stochastic does not vote bearish just because it flickers below D while pinned near the top", () => {
    const r = tenInOne(buildCtx(trend(1)), 259);
    expect(r.votes.find((v) => v.name === "Stochastic")!.vote).not.toBe(-1);
  });

  it("counts always add up to ten", () => {
    const r = tenInOne(buildCtx(trend(1)), 120);
    expect(r.bullish + r.bearish + r.neutral).toBe(10);
    expect(r.votes).toHaveLength(10);
  });
});
