import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis/analyze";
import { market } from "@/lib/analysis/testdata";

process.env.DATABASE_FILE = ":memory:";
const { trackTarget } = await import("./job");
const { listSignals } = await import("./db");

const STEP = 900;

/** Smallest history length at which at least one strategy has a live setup, found by scanning. */
function lengthWithSetup(): number {
  for (let n = 1000; n < 1700; n++) {
    const c = market(n);
    const a = analyze(c, STEP, { nowSec: c[c.length - 1].time + STEP });
    if (a && a.live.length > 0) return n;
  }
  throw new Error("test data produced no setup");
}

describe("tracker pass", () => {
  const n = lengthWithSetup();
  const c = market(n);
  const now = c[c.length - 1].time + STEP;

  it("records every strategy's setup on the last closed candle, open, with the label it had", () => {
    const r = trackTarget("XAUUSD", "15m", c, now);
    const stored = listSignals("XAUUSD", "15m");
    expect(r.added).toBe(stored.length); // the report matches what is in the database
    expect(r.settled).toBe(0);
    expect(stored.length).toBeGreaterThan(0);
    for (const s of stored) {
      expect(s.outcome).toBe("open");
      expect(s.time).toBe(c[c.length - 1].time);
      expect(["unproven", "promising", "proven"]).toContain(s.tier);
      expect(s.strategy).not.toBe("legacy");
      expect(s.rr).toBeGreaterThanOrEqual(1.5 - 1e-9);
      expect(s.id).toBe(`XAUUSD|15m|${s.strategy}|${s.time}`);
    }
  });

  it("running again on the same candle adds nothing", () => {
    const before = listSignals("XAUUSD", "15m").length;
    expect(trackTarget("XAUUSD", "15m", c, now)).toEqual({ added: 0, settled: 0 });
    expect(listSignals("XAUUSD", "15m")).toHaveLength(before);
  });

  it("settles earlier signals once later candles decide them, and keeps the recorded entry/stop/target", () => {
    const before = listSignals("XAUUSD", "15m");
    const longer = market(n + 120); // same market, more candles after the signal
    const r = trackTarget("XAUUSD", "15m", longer, longer[longer.length - 1].time + STEP);
    const after = listSignals("XAUUSD", "15m");
    expect(r.settled).toBeGreaterThan(0);
    for (const old of before) {
      const now2 = after.find((s) => s.id === old.id)!;
      expect(now2.entry).toBe(old.entry);
      expect(now2.stopLoss).toBe(old.stopLoss);
      expect(now2.takeProfit).toBe(old.takeProfit);
      expect(now2.tier).toBe(old.tier); // the label is as it was when the signal was made
    }
    const settled = before.map((o) => after.find((s) => s.id === o.id)!).filter((s) => s.outcome !== "open");
    expect(settled.length).toBeGreaterThan(0);
    for (const s of settled) {
      expect(["win", "loss", "timeout"]).toContain(s.outcome);
      expect(typeof s.r).toBe("number");
      expect(s.resolvedAt).toBeGreaterThan(s.time);
    }
  });

  it("keeps markets and timeframes separate", () => {
    trackTarget("BTCUSD", "1h", c, now);
    expect(listSignals("BTCUSD", "1h").every((s) => s.symbol === "BTCUSD" && s.tf === "1h")).toBe(true);
    expect(listSignals("XAUUSD", "1h")).toHaveLength(0);
  });

  it("copes with too little history (nothing recorded, no crash)", () => {
    const short = market(120);
    expect(() => trackTarget("XAUUSD", "4h", short, short[short.length - 1].time + STEP)).not.toThrow();
    expect(listSignals("XAUUSD", "4h")).toHaveLength(0);
  });
});
