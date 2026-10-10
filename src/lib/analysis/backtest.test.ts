import { describe, expect, it } from "vitest";
import type { Candle } from "../indicators";
import { analyze, bestSetup, isActionable, lastClosedIndex } from "./analyze";
import { classify, computeStats, runBacktest, simulateTrade, wilsonLow, type Stats, type Trade } from "./backtest";
import { buildCtx } from "./ctx";
import { MIN_RR, STRATEGIES, WARMUP, type Setup, type Strategy } from "./strategies";
import { market, T0 } from "./testdata";


const setup = (over: Partial<Setup> = {}): Setup => ({
  strategy: "t", name: "t", dir: 1, index: 0, entry: 100, sl: 99, tp: 102, rr: 2, reasons: [], ...over,
});
const bar = (i: number, h: number, l: number, c = (h + l) / 2): Candle =>
  ({ time: T0 + i * 60, open: c, high: h, low: l, close: c, volume: 1 });
const noCost = { costPct: 0, maxHold: 5 };

describe("simulateTrade", () => {
  it("long: target hit is a win worth the planned R", () => {
    const t = simulateTrade([bar(0, 100, 100), bar(1, 101, 99.5), bar(2, 102.5, 100.5)], setup(), noCost)!;
    expect(t.outcome).toBe("win");
    expect(t.r).toBeCloseTo(2);
    expect(t.exitIndex).toBe(2);
  });
  it("long: stop hit is -1R", () => {
    const t = simulateTrade([bar(0, 100, 100), bar(1, 100.5, 98.8)], setup(), noCost)!;
    expect(t.outcome).toBe("loss");
    expect(t.r).toBeCloseTo(-1);
  });
  it("a candle touching both stop and target counts as a loss", () => {
    const t = simulateTrade([bar(0, 100, 100), bar(1, 103, 98)], setup(), noCost)!;
    expect(t.outcome).toBe("loss");
  });
  it("short trades mirror long ones", () => {
    const s = setup({ dir: -1, sl: 101, tp: 98 });
    expect(simulateTrade([bar(0, 100, 100), bar(1, 100.5, 97.5)], s, noCost)!.outcome).toBe("win");
    expect(simulateTrade([bar(0, 100, 100), bar(1, 101.5, 99.5)], s, noCost)!.outcome).toBe("loss");
  });
  it("closes at the market after maxHold bars and reports the actual R", () => {
    const c = [bar(0, 100, 100), ...Array.from({ length: 5 }, (_, k) => bar(k + 1, 100.6, 99.6, 100.5))];
    const t = simulateTrade(c, setup(), noCost)!;
    expect(t.outcome).toBe("timeout");
    expect(t.r).toBeCloseTo(0.5);
  });
  it("does not count a trade the data hasn't resolved yet", () => {
    expect(simulateTrade([bar(0, 100, 100), bar(1, 100.4, 99.6)], setup(), noCost)).toBeNull();
  });
  it("execution cost makes every result worse", () => {
    const c = [bar(0, 100, 100), bar(1, 102.5, 100.5)];
    const free = simulateTrade(c, setup(), noCost)!;
    const costly = simulateTrade(c, setup(), { costPct: 0.001, maxHold: 5 })!;
    expect(costly.r).toBeLessThan(free.r);
    expect(costly.r).toBeCloseTo(2 - 0.1, 5); // 0.1 price units of cost on 1.0 of risk
  });
});

describe("statistics", () => {
  const t = (r: number, plannedRR = 2): Trade => ({
    index: 0, time: 0, dir: 1, entry: 1, sl: 0, tp: 2, plannedRR, exitIndex: 1, outcome: r > 0 ? "win" : "loss", r,
  });

  it("computes win rate, expectancy, profit factor and drawdown", () => {
    const s = computeStats([t(2), t(-1), t(2), t(-1), t(-1)]);
    expect(s.n).toBe(5);
    expect(s.winRate).toBeCloseTo(0.4);
    expect(s.expectancy).toBeCloseTo(0.2);
    expect(s.profitFactor).toBeCloseTo(4 / 3);
    expect(s.maxDrawdownR).toBeCloseTo(2); // peak 3 -> trough 1... from +3 after 3 trades down to +1
    expect(s.avgWinR).toBeCloseTo(2);
    expect(s.avgLossR).toBeCloseTo(-1);
    expect(s.breakEven).toBeCloseTo(1 / 3);
  });
  it("handles an empty sample without NaN", () => {
    const s = computeStats([]);
    expect(Object.values(s).every((v) => Number.isFinite(v))).toBe(true);
  });
  it("wilson bound is below the observed rate and tightens with more trades", () => {
    expect(wilsonLow(6, 10)).toBeLessThan(0.6);
    expect(wilsonLow(60, 100)).toBeGreaterThan(wilsonLow(6, 10));
    expect(wilsonLow(0, 0)).toBe(0);
  });
  it("only calls a strategy proven with a big enough, statistically better-than-break-even, out-of-sample-positive record", () => {
    const base: Stats = { ...computeStats([]), n: 40, winRate: 0.6, winRateLow: 0.45, breakEven: 1 / 3, expectancy: 0.5 };
    const good: Stats = { ...base, n: 10, expectancy: 0.3 };
    expect(classify(base, good)).toBe("proven");
    expect(classify({ ...base, n: 20 }, good)).toBe("promising"); // too few trades to be proven
    expect(classify({ ...base, winRateLow: 0.3 }, good)).toBe("promising"); // can't beat break-even with confidence
    expect(classify(base, { ...good, expectancy: -0.1 })).toBe("unproven"); // fails on the held-back recent data
    expect(classify({ ...base, expectancy: -0.1 }, good)).toBe("unproven");
    expect(classify({ ...base, n: 5 }, good)).toBe("unproven");
    expect(classify({ ...base, n: 19 }, good)).toBe("unproven"); // below the 20-trade floor
    expect(classify({ ...base, n: 25, expectancy: 0.1 }, good)).toBe("unproven"); // positive but not clearly so
    expect(classify({ ...base, n: 25 }, { ...good, n: 3 })).toBe("unproven"); // too little recent data to confirm
  });

  it("on prices with no edge at all, almost nothing earns a label (false-positive guard)", () => {
    let labelled = 0, total = 0;
    for (let k = 1; k <= 12; k++) {
      let s = k * 7919;
      const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
      const c: Candle[] = [];
      let price = 2000;
      for (let i = 0; i < 1000; i++) {
        const open = price, vol = 0.0035;
        const close = open * (1 + (rnd() - 0.5) * 2 * vol);
        c.push({ time: T0 + i * 900, open, high: Math.max(open, close) * (1 + rnd() * vol), low: Math.min(open, close) * (1 - rnd() * vol), close, volume: 100 });
        price = close;
      }
      for (const r of runBacktest(buildCtx(c), STRATEGIES)) {
        total++;
        if (r.tier !== "unproven") labelled++;
      }
    }
    expect(total).toBe(12 * STRATEGIES.length);
    expect(labelled / total).toBeLessThan(0.05);
  }, 120_000);
});

describe("runBacktest", () => {
  const x = buildCtx(market(900));

  it("takes one trade at a time per strategy and counts a loss as one", () => {
    // A stub that proposes a trade on every single bar.
    const every: Strategy = {
      id: "every", name: "every", about: "",
      run: (c, i) => ({ strategy: "every", name: "every", dir: 1, index: i, entry: c.c[i].close, sl: c.c[i].close - c.atr[i], tp: c.c[i].close + 2 * c.atr[i], rr: 2, reasons: [] }),
    };
    const [r] = runBacktest(x, [every]);
    expect(r.trades.length).toBeGreaterThan(20);
    for (let k = 1; k < r.trades.length; k++) {
      expect(r.trades[k].index).toBeGreaterThan(r.trades[k - 1].exitIndex);
    }
  });

  it("splits trades into a training 70% and a held-back 30% by time", () => {
    const every: Strategy = {
      id: "every", name: "every", about: "",
      run: (c, i) => ({ strategy: "every", name: "every", dir: 1, index: i, entry: c.c[i].close, sl: c.c[i].close - c.atr[i], tp: c.c[i].close + 2 * c.atr[i], rr: 2, reasons: [] }),
    };
    const [r] = runBacktest(x, [every]);
    expect(r.train.n + r.test.n).toBe(r.all.n);
    expect(r.test.n).toBeGreaterThan(0);
    expect(r.train.n).toBeGreaterThan(r.test.n);
  });
});

describe("strategies", () => {
  const c = market(2600);
  const x = buildCtx(c);

  /**
   * Compares the signal from the full history with the one from only the candles up to that bar.
   * Checks every bar that actually produced a setup (up to `cap`) plus a sprinkling of empty bars.
   */
  function lookaheadReport(strat: Strategy, cap = 25) {
    let withSetup = 0, mismatches = 0, empties = 0;
    for (let i = WARMUP; i < c.length - 1; i++) {
      const full = strat.run(x, i);
      const sample = full ? withSetup < cap : i % 41 === 0;
      if (!sample) continue;
      const partial = strat.run(buildCtx(c.slice(0, i + 1)), i);
      if (JSON.stringify(partial) !== JSON.stringify(full)) mismatches++;
      if (full) withSetup++; else empties++;
    }
    return { withSetup, mismatches, empties };
  }

  it("never look ahead: signals from the full history equal those from only the candles up to each bar", () => {
    for (const strat of STRATEGIES) {
      const r = lookaheadReport(strat);
      expect(r.mismatches, `${strat.id}: ${JSON.stringify(r)}`).toBe(0);
      expect(r.withSetup, `${strat.id} must actually be exercised`).toBeGreaterThanOrEqual(5);
    }
  }, 180_000);

  it("the check itself works: a strategy that peeks at the next candle is caught", () => {
    const cheat: Strategy = {
      id: "cheat", name: "cheat", about: "",
      run: (cx, i) =>
        cx.c[i + 1] && cx.c[i + 1].close > cx.c[i].close
          ? { strategy: "cheat", name: "cheat", dir: 1, index: i, entry: cx.c[i].close, sl: cx.c[i].close - cx.atr[i], tp: cx.c[i].close + 2 * cx.atr[i], rr: 2, reasons: ["peeks"] }
          : null,
    };
    expect(lookaheadReport(cheat).mismatches).toBeGreaterThan(0);
  });

  it("every setup has stop and target on the right sides and at least the minimum reward:risk", () => {
    let total = 0;
    for (const strat of STRATEGIES) {
      for (let i = WARMUP; i < c.length - 1; i++) {
        const s = strat.run(x, i);
        if (!s) continue;
        total++;
        expect(s.dir === 1 ? s.sl < s.entry && s.tp > s.entry : s.sl > s.entry && s.tp < s.entry).toBe(true);
        expect(s.rr).toBeGreaterThanOrEqual(MIN_RR - 1e-9);
        const risk = Math.abs(s.entry - s.sl);
        expect(risk).toBeGreaterThanOrEqual(0.3 * x.atr[i] - 1e-9);
        expect(risk).toBeLessThanOrEqual(3 * x.atr[i] + 1e-9);
        expect(s.reasons.length).toBeGreaterThan(0);
      }
    }
    expect(total).toBeGreaterThan(20);
  });

  it("each strategy actually produces setups on a market with trends and ranges", () => {
    const counts: Record<string, number> = {};
    for (const strat of STRATEGIES) {
      counts[strat.id] = 0;
      for (let i = WARMUP; i < c.length - 1; i++) if (strat.run(x, i)) counts[strat.id]++;
    }
    expect(counts, JSON.stringify(counts)).toSatisfy((v: Record<string, number>) => Object.values(v).every((n) => n > 0));
  });
});

describe("analyze", () => {
  it("returns null with too little history", () => {
    expect(analyze(market(100), 900)).toBeNull();
  });

  it("uses the last closed candle, so a still-forming candle never repaints the signal", () => {
    const c = market(900);
    const tf = 900;
    const last = c[c.length - 1].time;
    expect(lastClosedIndex(c, tf, last + 10)).toBe(c.length - 2); // still forming
    expect(lastClosedIndex(c, tf, last + tf)).toBe(c.length - 1); // just closed
  });

  it("produces results for every strategy; live setups are ordered by evidence", () => {
    const c = market(1200);
    const a = analyze(c, 900, { nowSec: c[c.length - 1].time + 900 })!;
    expect(a.results).toHaveLength(STRATEGIES.length);
    expect(a.confluence.votes).toHaveLength(10);
    for (const s of a.live) expect(s.rr).toBeGreaterThanOrEqual(MIN_RR - 1e-9);
    const rank = { proven: 2, promising: 1, unproven: 0 } as const;
    for (let k = 1; k < a.live.length; k++) expect(rank[a.live[k - 1].tier]).toBeGreaterThanOrEqual(rank[a.live[k].tier]);
    const best = bestSetup(a.live);
    if (best) expect(best.tier).not.toBe("unproven");
  });

  it("statistics ignore the forming candle: changing it does not change the backtest or the live setups", () => {
    const c = market(1200);
    const closedNow = c[c.length - 2].time + 900; // last candle is still forming at this moment
    const a1 = analyze(c, 900, { nowSec: closedNow })!;
    const wild = c.map((k, i) => (i === c.length - 1 ? { ...k, high: k.high * 1.2, low: k.low * 0.8, close: k.close * 1.1 } : k));
    const a2 = analyze(wild, 900, { nowSec: closedNow })!;
    expect(a2.ctx.n).toBe(c.length - 1);
    expect(JSON.stringify(a2.results)).toBe(JSON.stringify(a1.results));
    expect(JSON.stringify(a2.live.map((s) => s.entry))).toBe(JSON.stringify(a1.live.map((s) => s.entry)));
  });
});

describe("isActionable", () => {
  const s = setup({ dir: 1, entry: 100, sl: 99, tp: 102 });
  it("is actionable while price stays between stop and target and near the entry", () => {
    expect(isActionable(s, [bar(1, 100.6, 99.6, 100.3)], 2)).toBe(true);
    expect(isActionable(s, [], 2)).toBe(true);
  });
  it("expires once the stop or the target has been touched", () => {
    expect(isActionable(s, [bar(1, 100.6, 98.9)], 2)).toBe(false);
    expect(isActionable(s, [bar(1, 102.1, 100.1)], 2)).toBe(false);
  });
  it("expires when price has run more than one ATR away without touching either level", () => {
    const far = setup({ dir: 1, entry: 100, sl: 90, tp: 130 });
    expect(isActionable(far, [bar(1, 105, 101, 104)], 2)).toBe(false);
  });
});
