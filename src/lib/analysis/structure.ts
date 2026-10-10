import type { Candle } from "../indicators";

export interface Swing {
  index: number;
  price: number;
  type: "high" | "low";
}

/**
 * Pivot highs/lows: a high is a swing if it beats `left` candles before and is not beaten by `right` after.
 * A swing at index i is only *known* at index i + right (use `confirmedBy`) so nothing here looks ahead.
 */
export function findSwings(c: Candle[], left = 3, right = 3): Swing[] {
  const out: Swing[] = [];
  for (let i = left; i < c.length - right; i++) {
    let hi = true;
    let lo = true;
    for (let j = 1; j <= left && (hi || lo); j++) {
      if (c[i].high <= c[i - j].high) hi = false;
      if (c[i].low >= c[i - j].low) lo = false;
    }
    for (let j = 1; j <= right && (hi || lo); j++) {
      if (c[i].high < c[i + j].high) hi = false;
      if (c[i].low > c[i + j].low) lo = false;
    }
    if (hi) out.push({ index: i, price: c[i].high, type: "high" });
    if (lo) out.push({ index: i, price: c[i].low, type: "low" });
  }
  return out;
}

/** Swings that were already visible at bar `i`. */
export const confirmedBy = (swings: Swing[], right: number, i: number): Swing[] =>
  swings.filter((s) => s.index + right <= i);

export interface StructEvent {
  /** Bar whose close broke the level. */
  index: number;
  dir: 1 | -1;
  /** BOS continues the prior trend; CHoCH is the first break against it. */
  kind: "BOS" | "CHoCH";
  level: number;
  /** Index of the swing that was broken. */
  swingIndex: number;
}

export interface SwingLabel {
  index: number;
  price: number;
  label: "HH" | "HL" | "LH" | "LL";
}

export interface Structure {
  events: StructEvent[];
  labels: SwingLabel[];
  /** Trend after each bar: 1 up, -1 down, 0 not yet established. */
  trend: (1 | -1 | 0)[];
}

export function analyzeStructure(c: Candle[], swings: Swing[], right: number): Structure {
  const byConfirm = new Map<number, Swing[]>();
  for (const s of swings) {
    const k = s.index + right;
    const list = byConfirm.get(k);
    if (list) list.push(s); else byConfirm.set(k, [s]);
  }

  const events: StructEvent[] = [];
  const labels: SwingLabel[] = [];
  const trendArr: (1 | -1 | 0)[] = [];
  let trend: 1 | -1 | 0 = 0;
  let lastHigh: { s: Swing; broken: boolean } | null = null;
  let lastLow: { s: Swing; broken: boolean } | null = null;
  let prevHighPrice: number | null = null;
  let prevLowPrice: number | null = null;

  for (let i = 0; i < c.length; i++) {
    for (const s of byConfirm.get(i) ?? []) {
      if (s.type === "high") {
        if (prevHighPrice !== null) labels.push({ index: s.index, price: s.price, label: s.price > prevHighPrice ? "HH" : "LH" });
        prevHighPrice = s.price;
        lastHigh = { s, broken: false };
      } else {
        if (prevLowPrice !== null) labels.push({ index: s.index, price: s.price, label: s.price > prevLowPrice ? "HL" : "LL" });
        prevLowPrice = s.price;
        lastLow = { s, broken: false };
      }
    }
    if (lastHigh && !lastHigh.broken && c[i].close > lastHigh.s.price) {
      events.push({ index: i, dir: 1, kind: trend === -1 ? "CHoCH" : "BOS", level: lastHigh.s.price, swingIndex: lastHigh.s.index });
      trend = 1;
      lastHigh.broken = true;
    } else if (lastLow && !lastLow.broken && c[i].close < lastLow.s.price) {
      events.push({ index: i, dir: -1, kind: trend === 1 ? "CHoCH" : "BOS", level: lastLow.s.price, swingIndex: lastLow.s.index });
      trend = -1;
      lastLow.broken = true;
    }
    trendArr.push(trend);
  }
  return { events, labels, trend: trendArr };
}
