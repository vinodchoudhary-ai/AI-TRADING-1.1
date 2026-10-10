import { describe, expect, it } from "vitest";
import type { Candle } from "../indicators";
import { analyze, type Analysis } from "./analyze";
import { ALL_IDS, CATALOG, DEFAULT_ENABLED, unavailable, type IndicatorId } from "./catalog";
import { buildOverlays } from "./overlays";
import { market } from "./testdata";

const make = (c: Candle[]): Analysis => analyze(c, 900, { nowSec: c[c.length - 1].time + 900 })!;
const ids = (...v: IndicatorId[]) => new Set<string>(v);

describe("catalog", () => {
  it("has six categories, unique ids, and defaults that exist", () => {
    expect(CATALOG).toHaveLength(6);
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
    for (const d of DEFAULT_ENABLED) expect(ALL_IDS).toContain(d);
  });
  it("marks feeds we don't have as unavailable, and data-dependent ones by what the data contains", () => {
    const none = { hasVolume: false, hasDelta: false };
    for (const id of ["footprint", "bookmap", "heatmap"] as const) expect(unavailable(id, { hasVolume: true, hasDelta: true })).toBe("na.feed");
    expect(unavailable("volume", none)).toBe("na.volume");
    expect(unavailable("volume", { ...none, hasVolume: true })).toBeNull();
    expect(unavailable("delta", none)).toBe("na.delta");
    expect(unavailable("delta", { ...none, hasDelta: true })).toBeNull();
    expect(unavailable("ema", none)).toBeNull();
  });
});

describe("buildOverlays", () => {
  const a = make(market(1200));
  const closes = a.ctx.c;

  it("draws nothing when nothing is switched on", () => {
    const o = buildOverlays(a, ids(), null);
    expect(o).toEqual({ lines: [], hists: [], zones: [], levels: [], markers: [], panes: [] });
  });

  it("EMA gives four lines whose points are real numbers or gaps, in time order", () => {
    const o = buildOverlays(a, ids("ema"), null);
    expect(o.lines.map((l) => l.id)).toEqual(["ema9", "ema21", "ema50", "ema200"]);
    for (const l of o.lines) {
      expect(l.data.length).toBeGreaterThan(100);
      for (let k = 1; k < l.data.length; k++) expect(l.data[k].time).toBeGreaterThan(l.data[k - 1].time);
      expect(l.data.every((p) => p.value === null || Number.isFinite(p.value))).toBe(true);
    }
  });

  it("MACD + RSI adds two panes with their own series", () => {
    const o = buildOverlays(a, ids("macdrsi"), null);
    expect(o.panes).toEqual(["rsi", "macd"]);
    expect(o.lines.filter((l) => l.pane === "rsi").length).toBeGreaterThanOrEqual(1);
    expect(o.hists.some((h) => h.pane === "macd")).toBe(true);
  });

  it("volume shows when the feed has it and is skipped when it doesn't", () => {
    expect(buildOverlays(a, ids("volume"), null).panes).toEqual(["volume"]);
    const noVol = make(market(1200).map((k) => ({ ...k, volume: 0 })));
    expect(buildOverlays(noVol, ids("volume"), null).panes).toEqual([]);
  });

  it("volume delta needs taker-buy volume", () => {
    expect(buildOverlays(a, ids("delta"), null).panes).toEqual([]);
    const withBuy = make(market(1200).map((k) => ({ ...k, buyVolume: k.volume * 0.6 })));
    const o = buildOverlays(withBuy, ids("delta"), null);
    expect(o.panes).toEqual(["delta"]);
    expect(o.hists[0].data.every((d) => d.value > 0)).toBe(true); // 60% buy -> positive delta
  });

  it("order-flow tools we have no data for draw nothing, even if switched on", () => {
    const o = buildOverlays(a, ids("footprint", "bookmap", "heatmap"), null);
    expect(o).toEqual({ lines: [], hists: [], zones: [], levels: [], markers: [], panes: [] });
  });

  it("FVG and order-block zones are only ones still open, and never absurdly tall", () => {
    const o = buildOverlays(a, ids("fvg", "orderblock"), null);
    expect(o.zones.length).toBeLessThanOrEqual(10);
    const atr = a.ctx.atr[a.ctx.n - 1];
    const price = a.ctx.c[a.ctx.n - 1].close;
    for (const z of o.zones) {
      expect(z.top).toBeGreaterThan(z.bottom);
      expect(z.t2).toBeNull();
      // sized against the ATR of the day it formed; allow a wide margin for ATR drift
      expect(z.top - z.bottom).toBeLessThanOrEqual(8 * atr);
      // and never miles from where price is now
      expect(Math.abs((z.top + z.bottom) / 2 - price)).toBeLessThanOrEqual(12 * atr + 1e-6);
    }
  });

  it("Smart Money switches on structure, FVG and order blocks together", () => {
    const smc = buildOverlays(a, ids("smc"), null);
    const manual = buildOverlays(a, ids("structure", "fvg", "orderblock"), null);
    expect(JSON.stringify(smc)).toBe(JSON.stringify(manual));
  });

  it("markers come out sorted by time (the chart requires it)", () => {
    const o = buildOverlays(a, ids("structure", "candles", "scalp", "trendlines"), null);
    expect(o.markers.length).toBeGreaterThan(0);
    for (let k = 1; k < o.markers.length; k++) expect(o.markers[k].time).toBeGreaterThanOrEqual(o.markers[k - 1].time);
  });

  it("levels: liquidity, volume profile and fib produce labelled price levels", () => {
    const o = buildOverlays(a, ids("volprofile", "autofib", "liquidity"), null);
    const titles = o.levels.map((l) => l.title);
    expect(titles).toEqual(expect.arrayContaining(["POC", "VAH", "VAL"]));
    expect(titles.some((t) => t.startsWith("Fib"))).toBe(true);
    expect(o.levels.every((l) => Number.isFinite(l.price))).toBe(true);
  });

  it("a selected setup draws an entry, a target zone and a stop zone", () => {
    const setup = { strategy: "t", name: "t", dir: 1 as const, index: closes.length - 1, entry: closes[closes.length - 1].close, sl: closes[closes.length - 1].close - 5, tp: closes[closes.length - 1].close + 10, rr: 2, reasons: [] };
    const o = buildOverlays(a, ids(), setup);
    expect(o.zones).toHaveLength(2);
    expect(o.zones[0].label).toMatch(/^TP /);
    expect(o.zones[1].label).toMatch(/^SL /);
    expect(o.levels.map((l) => l.title)).toEqual([expect.stringMatching(/^BUY /), "TP", "SL"]);
  });
});
