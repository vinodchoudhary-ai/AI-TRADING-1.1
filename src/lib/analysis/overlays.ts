import type { Candle } from "../indicators";
import { volumeDelta } from "../ta";
import type { Analysis } from "./analyze";
import { unavailable, type IndicatorId } from "./catalog";
import type { Ctx } from "./ctx";
import { doublePatterns, trendLinesAt } from "./patterns";
import type { Setup } from "./strategies";
import { activeAt, autoFib, equalLevels, srZonesAt, volumeProfile, type Zone } from "./zones";

export type PaneKey = "main" | "rsi" | "macd" | "volume" | "delta";

export interface LineSpec {
  id: string;
  pane: PaneKey;
  color: string;
  width: 1 | 2 | 3;
  dashed?: boolean;
  /** value null = a gap in the line. */
  data: { time: number; value: number | null }[];
}
export interface HistSpec {
  id: string;
  pane: PaneKey;
  data: { time: number; value: number; color: string }[];
}
export interface ZoneSpec {
  top: number;
  bottom: number;
  /** Start time; null end = runs to the right edge. */
  t1: number;
  t2: number | null;
  fill: string;
  border: string;
  label: string;
}
export interface LevelSpec {
  price: number;
  color: string;
  title: string;
  dashed?: boolean;
}
export interface MarkerSpec {
  time: number;
  position: "aboveBar" | "belowBar";
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  color: string;
  text?: string;
}
export interface Overlays {
  lines: LineSpec[];
  hists: HistSpec[];
  zones: ZoneSpec[];
  levels: LevelSpec[];
  markers: MarkerSpec[];
  /** Extra panes under the price chart, in display order. */
  panes: Exclude<PaneKey, "main">[];
}

const GREEN = "#22c55e", RED = "#ef4444", GRAY = "#94a3b8", GOLD = "#f5c542";
const finite = (v: number) => Number.isFinite(v);

const series = (c: Candle[], arr: number[], from = 0) =>
  arr.map((v, i) => ({ time: c[i].time, value: finite(v) ? v : null })).slice(from);

export const EMPTY: Overlays = { lines: [], hists: [], zones: [], levels: [], markers: [], panes: [] };

/** How many of the most recent zones/markers to show, so the chart stays readable. */
const MAX_ZONES = 6;
const MAX_MARKERS = 40;

/** Keeps the zones closest to price, dropping any more than `reach` away (they only clutter and can't matter soon). */
function zonesNear(zs: Zone[], price: number, max: number, reach = Infinity): Zone[] {
  return [...zs].filter((z) => Math.abs((z.top + z.bottom) / 2 - price) <= reach).sort((a, b) => Math.abs((a.top + a.bottom) / 2 - price) - Math.abs((b.top + b.bottom) / 2 - price)).slice(0, max);
}

export function buildOverlays(a: Analysis, enabled: ReadonlySet<string>, selected: Setup | null): Overlays {
  const x: Ctx = a.ctx;
  const c = x.c;
  const last = x.n - 1;
  const price = c[last].close;
  const o: Overlays = { lines: [], hists: [], zones: [], levels: [], markers: [], panes: [] };
  const hasDelta = c.some((k) => k.buyVolume !== undefined);
  const usable = (id: IndicatorId) => enabled.has(id) && unavailable(id, { hasVolume: x.hasVolume, hasDelta }) === null;
  // Smart Money switches on the structure pieces it is made of.
  const on = (id: IndicatorId) =>
    usable(id) || (usable("smc") && (id === "structure" || id === "fvg" || id === "orderblock"));
  const t = (i: number) => c[i].time;
  const recent = Math.max(0, last - 400); // how far back overlays reach

  if (on("ema")) {
    o.lines.push(
      { id: "ema9", pane: "main", color: "#38bdf8", width: 1, data: series(c, x.ema9, recent) },
      { id: "ema21", pane: "main", color: GOLD, width: 1, data: series(c, x.ema21, recent) },
      { id: "ema50", pane: "main", color: "#fb923c", width: 1, data: series(c, x.ema50, recent) },
      { id: "ema200", pane: "main", color: "#a78bfa", width: 2, data: series(c, x.ema200, recent) },
    );
  }
  if (on("boll")) {
    o.lines.push(
      { id: "bbU", pane: "main", color: "#64748b", width: 1, dashed: true, data: series(c, x.bbU, recent) },
      { id: "bbM", pane: "main", color: GRAY, width: 1, dashed: true, data: series(c, x.bbM, recent) },
      { id: "bbL", pane: "main", color: "#64748b", width: 1, dashed: true, data: series(c, x.bbL, recent) },
    );
  }
  if (on("volzones")) {
    o.lines.push(
      { id: "kcU", pane: "main", color: "#22d3ee", width: 1, dashed: true, data: series(c, x.ema21.map((v, i) => v + 2 * x.atr[i]), recent) },
      { id: "kcL", pane: "main", color: "#22d3ee", width: 1, dashed: true, data: series(c, x.ema21.map((v, i) => v - 2 * x.atr[i]), recent) },
    );
  }
  if (on("direction")) {
    const up = x.st.line.map((v, i) => (x.st.dir[i] === 1 ? v : NaN));
    const down = x.st.line.map((v, i) => (x.st.dir[i] === -1 ? v : NaN));
    o.lines.push(
      { id: "stUp", pane: "main", color: GREEN, width: 2, data: series(c, up, recent) },
      { id: "stDown", pane: "main", color: RED, width: 2, data: series(c, down, recent) },
    );
  }

  if (on("fvg")) {
    // Skip gaps left by violent candles (taller than 3 ATR): they are huge, stale and only clutter the chart.
    const sane = x.fvgs.filter((z) => activeAt(z, last) && z.from > last - 300 && z.top - z.bottom <= 3 * x.atr[z.from]);
    for (const z of zonesNear(sane, price, MAX_ZONES, 12 * x.atr[last])) {
      o.zones.push({
        top: z.top, bottom: z.bottom, t1: t(z.from), t2: null, label: "FVG",
        fill: z.dir === 1 ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)", border: z.dir === 1 ? GREEN : RED,
      });
    }
  }
  if (on("orderblock")) {
    // An order block is one candle: drop oversized or stale ones, which only clutter the chart.
    const sane = x.obs.filter((z) => activeAt(z, last) && z.from > last - 300 && z.top - z.bottom <= 3 * x.atr[z.from]);
    for (const z of zonesNear(sane, price, 4, 12 * x.atr[last])) {
      o.zones.push({
        top: z.top, bottom: z.bottom, t1: t(z.from), t2: null, label: z.dir === 1 ? "Bull OB" : "Bear OB",
        fill: z.dir === 1 ? "rgba(20,184,166,0.20)" : "rgba(244,63,94,0.20)", border: z.dir === 1 ? "#14b8a6" : "#f43f5e",
      });
    }
  }
  if (on("srzones")) {
    for (const z of zonesNear(srZonesAt(c, x.swings, x.right, last, x.atr[last]), price, MAX_ZONES)) {
      o.zones.push({
        top: z.top, bottom: z.bottom, t1: t(Math.max(0, z.from - 40)), t2: null, label: `S/R x${z.strength ?? 2}`,
        fill: "rgba(59,130,246,0.14)", border: "#3b82f6",
      });
    }
  }

  if (on("structure")) {
    for (const l of x.structure.labels.slice(-16)) {
      const high = l.label === "HH" || l.label === "LH";
      const bullish = l.label === "HH" || l.label === "HL";
      o.markers.push({ time: t(l.index), position: high ? "aboveBar" : "belowBar", shape: "circle", color: bullish ? GREEN : RED, text: l.label });
    }
    for (const e of x.structure.events.slice(-10)) {
      o.markers.push({ time: t(e.index), position: e.dir === 1 ? "belowBar" : "aboveBar", shape: e.dir === 1 ? "arrowUp" : "arrowDown", color: e.kind === "CHoCH" ? GOLD : e.dir === 1 ? GREEN : RED, text: e.kind });
    }
  }
  if (on("candles")) {
    for (const p of x.patterns.filter((p) => p.index > last - 150).slice(-MAX_MARKERS)) {
      o.markers.push({
        time: t(p.index), position: p.dir === -1 ? "aboveBar" : "belowBar",
        shape: p.dir === 1 ? "arrowUp" : p.dir === -1 ? "arrowDown" : "circle",
        color: p.dir === 1 ? GREEN : p.dir === -1 ? RED : GRAY, text: p.name.split(" ")[0],
      });
    }
  }
  if (on("scalp")) {
    const r = a.results.find((q) => q.id === "scalp");
    for (const tr of (r?.trades ?? []).filter((tr) => tr.index > last - 400)) {
      o.markers.push({
        time: t(tr.index), position: tr.dir === 1 ? "belowBar" : "aboveBar", shape: tr.dir === 1 ? "arrowUp" : "arrowDown",
        color: tr.r > 0 ? GREEN : tr.r < 0 ? RED : GRAY, text: `${tr.r > 0 ? "+" : ""}${tr.r.toFixed(1)}R`,
      });
    }
  }
  if (on("trendlines")) {
    for (const tl of trendLinesAt(x.swings, x.right, last)) {
      const slope = (tl.to.price - tl.from.price) / (tl.to.index - tl.from.index);
      o.lines.push({
        id: `tl-${tl.kind}`, pane: "main", color: tl.kind === "support" ? GREEN : RED, width: 2,
        data: [
          { time: t(tl.from.index), value: tl.from.price },
          { time: t(last), value: tl.from.price + slope * (last - tl.from.index) },
        ],
      });
    }
    for (const p of doublePatterns(c, x.swings, x.right, x.atr).filter((p) => p.index > last - 200).slice(-3)) {
      o.markers.push({ time: t(p.index), position: p.dir === -1 ? "aboveBar" : "belowBar", shape: "square", color: GOLD, text: p.name });
    }
  }

  if (on("volprofile")) {
    const vp = volumeProfile(c, last - 200, last);
    if (vp) {
      const tag = vp.volumeBased ? "" : " (time)";
      o.levels.push(
        { price: vp.poc, color: GOLD, title: `POC${tag}` },
        { price: vp.vah, color: GOLD, title: "VAH", dashed: true },
        { price: vp.val, color: GOLD, title: "VAL", dashed: true },
      );
    }
  }
  if (on("autofib")) {
    const f = autoFib(x.swings, x.right, last);
    if (f) for (const l of f.levels) o.levels.push({ price: l.price, color: l.ratio === 0.618 ? GOLD : GRAY, title: `Fib ${l.label}`, dashed: true });
  }
  if (on("liquidity")) {
    const eq = equalLevels(x.swings, x.right, last, 0.15 * x.atr[last]).slice(-4);
    for (const l of eq) o.levels.push({ price: l.price, color: "#e879f9", title: l.type === "eqh" ? "EQH" : "EQL", dashed: true });
    const per: [string, number][] = [["PDH", x.levels.pdh[last]], ["PDL", x.levels.pdl[last]], ["PWH", x.levels.pwh[last]], ["PWL", x.levels.pwl[last]]];
    for (const [title, p] of per) if (finite(p)) o.levels.push({ price: p, color: "#c084fc", title });
  }

  if (on("macdrsi")) {
    o.panes.push("rsi", "macd");
    o.lines.push(
      { id: "rsi", pane: "rsi", color: "#a78bfa", width: 2, data: series(c, x.rsi, recent) },
      { id: "rsi70", pane: "rsi", color: "#64748b", width: 1, dashed: true, data: c.slice(recent).map((k) => ({ time: k.time, value: 70 })) },
      { id: "rsi30", pane: "rsi", color: "#64748b", width: 1, dashed: true, data: c.slice(recent).map((k) => ({ time: k.time, value: 30 })) },
      { id: "macd", pane: "macd", color: "#38bdf8", width: 1, data: series(c, x.macdLine, recent) },
      { id: "macdSig", pane: "macd", color: "#f59e0b", width: 1, data: series(c, x.macdSig, recent) },
    );
    o.hists.push({
      id: "macdHist", pane: "macd",
      data: x.macdHist.map((v, i) => ({ time: c[i].time, value: v, color: v >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)" })).filter((d) => finite(d.value)).slice(recent),
    });
  }
  if (usable("volume")) {
    o.panes.push("volume");
    o.hists.push({ id: "volume", pane: "volume", data: c.map((k) => ({ time: k.time, value: k.volume, color: k.close >= k.open ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)" })).slice(recent) });
  }
  if (usable("delta")) {
    o.panes.push("delta");
    const d = volumeDelta(c);
    o.hists.push({ id: "delta", pane: "delta", data: d.map((v, i) => ({ time: c[i].time, value: v, color: v >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)" })).filter((p) => finite(p.value)).slice(recent) });
  }

  if (selected) {
    const t1 = t(Math.min(selected.index, last));
    o.zones.push(
      { top: Math.max(selected.entry, selected.tp), bottom: Math.min(selected.entry, selected.tp), t1, t2: null, fill: "rgba(34,197,94,0.14)", border: GREEN, label: `TP ${selected.tp.toFixed(2)}` },
      { top: Math.max(selected.entry, selected.sl), bottom: Math.min(selected.entry, selected.sl), t1, t2: null, fill: "rgba(239,68,68,0.14)", border: RED, label: `SL ${selected.sl.toFixed(2)}` },
    );
    o.levels.push(
      { price: selected.entry, color: "#e2e8f0", title: `${selected.dir === 1 ? "BUY" : "SELL"} ${selected.entry.toFixed(2)}` },
      { price: selected.tp, color: GREEN, title: "TP" },
      { price: selected.sl, color: RED, title: "SL" },
    );
  }

  o.markers.sort((p, q) => p.time - q.time);
  return o;
}
