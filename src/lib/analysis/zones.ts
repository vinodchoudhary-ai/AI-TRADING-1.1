import type { Candle } from "../indicators";
import { confirmedBy, type Structure, type Swing } from "./structure";

export interface Zone {
  kind: "fvg" | "ob" | "sr";
  /** 1 demand/bullish, -1 supply/bearish, 0 either (support/resistance). */
  dir: 1 | -1 | 0;
  top: number;
  bottom: number;
  /** Bar where the zone became known. */
  from: number;
  /** Bar where it was filled / invalidated, or null while still open. */
  to: number | null;
  /** Number of touches (S/R only). */
  strength?: number;
}

/** True if the zone existed and was still open at bar i (uses only bars up to i). */
export const activeAt = (z: Zone, i: number) => z.from <= i && (z.to === null || z.to > i);

/** Fair value gaps: three-candle imbalances at least `minAtr` x ATR tall. Closed when price fully refills them. */
export function findFvgs(c: Candle[], atrArr: number[], minAtr = 0.25): Zone[] {
  const out: Zone[] = [];
  for (let i = 2; i < c.length; i++) {
    const a = atrArr[i];
    if (Number.isNaN(a)) continue;
    let z: Zone | null = null;
    if (c[i].low > c[i - 2].high && c[i].low - c[i - 2].high >= minAtr * a) {
      z = { kind: "fvg", dir: 1, bottom: c[i - 2].high, top: c[i].low, from: i, to: null };
    } else if (c[i].high < c[i - 2].low && c[i - 2].low - c[i].high >= minAtr * a) {
      z = { kind: "fvg", dir: -1, top: c[i - 2].low, bottom: c[i].high, from: i, to: null };
    }
    if (!z) continue;
    for (let j = i + 1; j < c.length; j++) {
      if (z.dir === 1 ? c[j].low <= z.bottom : c[j].high >= z.top) { z.to = j; break; }
    }
    out.push(z);
  }
  return out;
}

/**
 * Order blocks: the last opposite-coloured candle before the move that broke structure.
 * Open until a later close goes through the far side of the block.
 */
export function findOrderBlocks(c: Candle[], st: Structure): Zone[] {
  const out: Zone[] = [];
  for (const e of st.events) {
    let m = e.swingIndex;
    for (let j = e.swingIndex; j <= e.index; j++) {
      if (e.dir === 1 ? c[j].low < c[m].low : c[j].high > c[m].high) m = j;
    }
    let ob = -1;
    for (let j = m; j >= Math.max(0, m - 5); j--) {
      if (e.dir === 1 ? c[j].close < c[j].open : c[j].close > c[j].open) { ob = j; break; }
    }
    if (ob < 0) ob = m;
    const z: Zone = { kind: "ob", dir: e.dir, top: c[ob].high, bottom: c[ob].low, from: e.index, to: null };
    for (let j = e.index + 1; j < c.length; j++) {
      if (e.dir === 1 ? c[j].close < z.bottom : c[j].close > z.top) { z.to = j; break; }
    }
    out.push(z);
  }
  return out;
}

/** Support/resistance: clusters of at least two swing points within 0.6 ATR, using only swings known at bar i. */
export function srZonesAt(c: Candle[], swings: Swing[], right: number, i: number, atrVal: number, maxSwings = 60): Zone[] {
  if (Number.isNaN(atrVal) || atrVal <= 0) return [];
  const pts = confirmedBy(swings, right, i).slice(-maxSwings).sort((a, b) => a.price - b.price);
  const tol = 0.6 * atrVal;
  const out: Zone[] = [];
  let group: Swing[] = [];
  const flush = () => {
    if (group.length >= 2) {
      const prices = group.map((s) => s.price);
      const pad = 0.1 * atrVal;
      out.push({
        kind: "sr", dir: 0, bottom: Math.min(...prices) - pad, top: Math.max(...prices) + pad,
        from: Math.min(...group.map((s) => s.index + right)), to: null, strength: group.length,
      });
    }
    group = [];
  };
  for (const p of pts) {
    if (group.length && p.price - group[group.length - 1].price > tol) flush();
    group.push(p);
  }
  flush();
  return out;
}

export interface LiquidityLevel {
  price: number;
  type: "eqh" | "eql";
  /** Bar where the second touch was confirmed. */
  index: number;
}

/** Equal highs / equal lows: two swings of the same type within `tol` of each other. */
export function equalLevels(swings: Swing[], right: number, i: number, tol: number): LiquidityLevel[] {
  const known = confirmedBy(swings, right, i).slice(-40);
  const out: LiquidityLevel[] = [];
  for (const type of ["high", "low"] as const) {
    const same = known.filter((s) => s.type === type);
    for (let a = 0; a < same.length; a++) {
      for (let b = a + 1; b < same.length; b++) {
        if (Math.abs(same[a].price - same[b].price) <= tol) {
          out.push({ price: (same[a].price + same[b].price) / 2, type: type === "high" ? "eqh" : "eql", index: same[b].index + right });
        }
      }
    }
  }
  return out;
}

/** Previous-day and previous-week high/low aligned to every candle (UTC days, Monday-start weeks). */
export function periodLevels(c: Candle[]) {
  const n = c.length;
  const pdh = new Array<number>(n).fill(NaN), pdl = new Array<number>(n).fill(NaN);
  const pwh = new Array<number>(n).fill(NaN), pwl = new Array<number>(n).fill(NaN);
  type Agg = { key: number; high: number; low: number };
  let day: Agg | null = null, prevDay: Agg | null = null;
  let week: Agg | null = null, prevWeek: Agg | null = null;
  for (let i = 0; i < n; i++) {
    const days = Math.floor(c[i].time / 86400);
    const dk = days;
    const wk = Math.floor((days + 3) / 7); // 1970-01-01 was a Thursday
    if (!day || day.key !== dk) { prevDay = day; day = { key: dk, high: c[i].high, low: c[i].low }; }
    else { day.high = Math.max(day.high, c[i].high); day.low = Math.min(day.low, c[i].low); }
    if (!week || week.key !== wk) { prevWeek = week; week = { key: wk, high: c[i].high, low: c[i].low }; }
    else { week.high = Math.max(week.high, c[i].high); week.low = Math.min(week.low, c[i].low); }
    if (prevDay) { pdh[i] = prevDay.high; pdl[i] = prevDay.low; }
    if (prevWeek) { pwh[i] = prevWeek.high; pwl[i] = prevWeek.low; }
  }
  return { pdh, pdl, pwh, pwl };
}

export interface Profile {
  poc: number;
  vah: number;
  val: number;
  /** false when the feed has no volume: bins then count time spent at each price (a TPO-style profile). */
  volumeBased: boolean;
}

export function volumeProfile(c: Candle[], from: number, to: number, bins = 40): Profile | null {
  const slice = c.slice(Math.max(0, from), to + 1);
  if (slice.length < 5) return null;
  const lo = Math.min(...slice.map((x) => x.low));
  const hi = Math.max(...slice.map((x) => x.high));
  if (!(hi > lo)) return null;
  const volumeBased = slice.some((x) => x.volume > 0);
  const size = (hi - lo) / bins;
  const hist = new Array<number>(bins).fill(0);
  for (const x of slice) {
    const a = Math.min(bins - 1, Math.floor((x.low - lo) / size));
    const b = Math.min(bins - 1, Math.floor((x.high - lo) / size));
    const w = (volumeBased ? x.volume : 1) / (b - a + 1);
    for (let k = a; k <= b; k++) hist[k] += w;
  }
  const total = hist.reduce((s, v) => s + v, 0);
  let poc = 0;
  hist.forEach((v, k) => { if (v > hist[poc]) poc = k; });
  let loK = poc, hiK = poc, acc = hist[poc];
  while (acc < 0.7 * total && (loK > 0 || hiK < bins - 1)) {
    const below = loK > 0 ? hist[loK - 1] : -1;
    const above = hiK < bins - 1 ? hist[hiK + 1] : -1;
    if (above >= below) { hiK++; acc += hist[hiK]; } else { loK--; acc += hist[loK]; }
  }
  const price = (k: number) => lo + (k + 0.5) * size;
  return { poc: price(poc), vah: lo + (hiK + 1) * size, val: lo + loK * size, volumeBased };
}

export interface FibLevel {
  ratio: number;
  price: number;
  label: string;
}

/** Fibonacci levels of the latest swing leg known at bar i. */
export function autoFib(swings: Swing[], right: number, i: number): { dir: 1 | -1; high: number; low: number; levels: FibLevel[] } | null {
  const known = confirmedBy(swings, right, i);
  const hi = [...known].reverse().find((s) => s.type === "high");
  const lo = [...known].reverse().find((s) => s.type === "low");
  if (!hi || !lo || hi.price <= lo.price) return null;
  const range = hi.price - lo.price;
  const dir: 1 | -1 = hi.index > lo.index ? 1 : -1; // direction of the last leg
  const at = (r: number) => (dir === 1 ? hi.price - r * range : lo.price + r * range);
  const ext = (r: number) => (dir === 1 ? lo.price + r * range : hi.price - r * range);
  const levels: FibLevel[] = [0.236, 0.382, 0.5, 0.618, 0.786].map((r) => ({ ratio: r, price: at(r), label: `${r}` }));
  levels.push({ ratio: 1.272, price: ext(1.272), label: "1.272" }, { ratio: 1.618, price: ext(1.618), label: "1.618" });
  return { dir, high: hi.price, low: lo.price, levels };
}
