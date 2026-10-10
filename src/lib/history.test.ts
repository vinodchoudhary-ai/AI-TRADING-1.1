import { describe, expect, it } from "vitest";
import type { Candle } from "./indicators";
import { addSignal, MIN_SAMPLE, resolveAll, resolveStored, stats, statsByStrategy, toStored, type StoredSignal } from "./history";
import type { Setup } from "./analysis/strategies";

const NO_COST = { costPct: 0, maxHold: 5 };
const bar = (i: number, h: number, l: number, c = (h + l) / 2): Candle => ({ time: 1000 + i * 60, open: c, high: h, low: l, close: c, volume: 1 });

const stored = (over: Partial<StoredSignal> = {}): StoredSignal => ({
  id: "X|1h|pullback|1000", symbol: "X", tf: "1h", time: 1000, strategy: "pullback", tier: "unproven",
  direction: "BUY", entry: 100, stopLoss: 99, takeProfit: 102, rr: 2, outcome: "open", ...over,
});

describe("toStored", () => {
  it("turns a setup into an open record with a per-strategy id and the label at signal time", () => {
    const s: Setup = { strategy: "smc", name: "Smart money", dir: -1, index: 7, entry: 50, sl: 51, tp: 48, rr: 2, reasons: [] };
    const r = toStored("BTCUSD", "15m", 123456, s, "promising");
    expect(r).toMatchObject({ id: "BTCUSD|15m|smc|123456", direction: "SELL", strategy: "smc", tier: "promising", outcome: "open", rr: 2 });
  });
});

describe("resolveStored (same rules as the backtest)", () => {
  it("settles a win at the target and records R", () => {
    const r = resolveStored(stored(), [bar(0, 100, 100), bar(1, 100.5, 99.5), bar(2, 102.4, 100.2)], NO_COST);
    expect(r.outcome).toBe("win");
    expect(r.r).toBeCloseTo(2);
    expect(r.resolvedAt).toBe(1000 + 2 * 60);
  });
  it("settles a loss at the stop", () => {
    const r = resolveStored(stored(), [bar(0, 100, 100), bar(1, 100.4, 98.9)], NO_COST);
    expect(r).toMatchObject({ outcome: "loss" });
    expect(r.r).toBeCloseTo(-1);
  });
  it("a candle touching both counts as a loss", () => {
    expect(resolveStored(stored(), [bar(0, 100, 100), bar(1, 103, 98)], NO_COST).outcome).toBe("loss");
  });
  it("closes at the market after maxHold bars", () => {
    const c = [bar(0, 100, 100), ...Array.from({ length: 5 }, (_, k) => bar(k + 1, 100.6, 99.6, 100.5))];
    const r = resolveStored(stored(), c, NO_COST);
    expect(r.outcome).toBe("timeout");
    expect(r.r).toBeCloseTo(0.5);
  });
  it("stays open until the data can decide it", () => {
    expect(resolveStored(stored(), [bar(0, 100, 100), bar(1, 100.4, 99.6)], NO_COST).outcome).toBe("open");
  });
  it("stays open if its candle isn't in the data yet, and expires if it is older than all the data", () => {
    expect(resolveStored(stored({ time: 99999 }), [bar(0, 100, 100)], NO_COST).outcome).toBe("open");
    expect(resolveStored(stored({ time: 1 }), [bar(0, 100, 100)], NO_COST).outcome).toBe("expired");
  });
  it("never reopens or changes a settled signal", () => {
    const done = stored({ outcome: "loss", r: -1 });
    expect(resolveStored(done, [bar(0, 100, 100), bar(1, 105, 100)], NO_COST)).toBe(done);
  });
  it("resolveAll only touches the matching market and timeframe", () => {
    const other = stored({ id: "Y|1h|pullback|1000", symbol: "Y" });
    const out = resolveAll([stored(), other], "X", "1h", [bar(0, 100, 100), bar(1, 102.5, 100)], NO_COST);
    expect(out[0].outcome).toBe("win");
    expect(out[1].outcome).toBe("open");
  });
});

describe("addSignal", () => {
  it("does not duplicate an id or a persistent open same-direction setup from the same strategy", () => {
    expect(addSignal([stored()], stored())).toHaveLength(1);
    expect(addSignal([stored()], stored({ id: "X|1h|pullback|2000", time: 2000 }))).toHaveLength(1);
  });
  it("lets different strategies, opposite directions and settled predecessors through", () => {
    expect(addSignal([stored()], stored({ id: "X|1h|smc|1000", strategy: "smc" }))).toHaveLength(2);
    expect(addSignal([stored()], stored({ id: "X|1h|pullback|2000", time: 2000, direction: "SELL" }))).toHaveLength(2);
    expect(addSignal([stored({ outcome: "win", r: 2 })], stored({ id: "X|1h|pullback|2000", time: 2000 }))).toHaveLength(2);
  });
});

describe("statistics", () => {
  const done = (r: number, strategy = "pullback"): StoredSignal =>
    stored({ id: `${strategy}${Math.random()}`, strategy, outcome: r > 0 ? "win" : "loss", r });

  it("hides the win rate until enough signals have resolved", () => {
    const few = stats([done(2), done(-1)]);
    expect(few.winRate).toBeNull();
    expect(few.resolved).toBe(2);
    const many = stats(Array.from({ length: MIN_SAMPLE }, (_, i) => done(i % 2 ? -1 : 2)));
    expect(many.winRate).toBeCloseTo(0.5);
    expect(many.expectancy).toBeCloseTo(0.5);
  });
  it("counts open and expired signals separately and never in the win rate", () => {
    const s = stats([done(2), stored({ outcome: "open" }), stored({ outcome: "expired" })]);
    expect(s).toMatchObject({ wins: 1, losses: 0, open: 1, resolved: 1 });
  });
  it("counts a profitable timeout as a win and a losing one as a loss", () => {
    const s = stats([stored({ outcome: "timeout", r: 0.4 }), stored({ outcome: "timeout", r: -0.3 })]);
    expect(s).toMatchObject({ wins: 1, losses: 1 });
  });
  it("old rows without an R value still count by outcome, but give no expectancy", () => {
    const s = stats([stored({ strategy: "legacy", tier: null, outcome: "win" }), stored({ strategy: "legacy", tier: null, outcome: "loss" })]);
    expect(s).toMatchObject({ wins: 1, losses: 1, expectancy: null });
  });
  it("splits by strategy", () => {
    const by = statsByStrategy([done(2, "a"), done(-1, "a"), done(2, "b")]);
    expect(by.map((b) => b.strategy)).toEqual(["a", "b"]);
    expect(by[0].stats.resolved).toBe(2);
    expect(by[1].stats.wins).toBe(1);
  });
});
