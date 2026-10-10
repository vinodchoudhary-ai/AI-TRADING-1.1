import type { Candle } from "../indicators";
import { confirmedBy, type Swing } from "./structure";

export interface CandlePattern {
  index: number;
  name: string;
  /** 1 bullish, -1 bearish, 0 indecision. */
  dir: 1 | -1 | 0;
}

const body = (x: Candle) => Math.abs(x.close - x.open);
const range = (x: Candle) => x.high - x.low;
const upperWick = (x: Candle) => x.high - Math.max(x.open, x.close);
const lowerWick = (x: Candle) => Math.min(x.open, x.close) - x.low;
const bull = (x: Candle) => x.close > x.open;
const bear = (x: Candle) => x.close < x.open;

/** Strongest recognised candle pattern ending at bar i (3-candle > engulfing > pin bar > doji), or null. */
export function candlePatternAt(c: Candle[], atrArr: number[], i: number): CandlePattern | null {
  if (i < 2) return null;
  const a = atrArr[i];
  if (Number.isNaN(a)) return null;
  const x = c[i], p = c[i - 1], q = c[i - 2];

  if (bear(q) && body(q) >= 0.8 * a && body(p) <= 0.3 * body(q) && bull(x) && x.close > (q.open + q.close) / 2) {
    return { index: i, name: "Morning star", dir: 1 };
  }
  if (bull(q) && body(q) >= 0.8 * a && body(p) <= 0.3 * body(q) && bear(x) && x.close < (q.open + q.close) / 2) {
    return { index: i, name: "Evening star", dir: -1 };
  }
  if (bear(p) && bull(x) && x.open <= p.close && x.close >= p.open && body(x) > body(p)) {
    return { index: i, name: "Bullish engulfing", dir: 1 };
  }
  if (bull(p) && bear(x) && x.open >= p.close && x.close <= p.open && body(x) > body(p)) {
    return { index: i, name: "Bearish engulfing", dir: -1 };
  }
  const r = range(x);
  if (r >= 0.6 * a) {
    if (lowerWick(x) >= 0.6 * r && body(x) <= 0.3 * r) return { index: i, name: "Hammer / bullish pin bar", dir: 1 };
    if (upperWick(x) >= 0.6 * r && body(x) <= 0.3 * r) return { index: i, name: "Shooting star / bearish pin bar", dir: -1 };
    if (body(x) <= 0.1 * r) return { index: i, name: "Doji", dir: 0 };
  }
  return null;
}

export function allCandlePatterns(c: Candle[], atrArr: number[]): CandlePattern[] {
  const out: CandlePattern[] = [];
  for (let i = 2; i < c.length; i++) {
    const p = candlePatternAt(c, atrArr, i);
    if (p) out.push(p);
  }
  return out;
}

export interface TrendLine {
  kind: "support" | "resistance";
  from: { index: number; price: number };
  to: { index: number; price: number };
}

/** Lines through the last two swing lows (support) and last two swing highs (resistance) known at bar i. */
export function trendLinesAt(swings: Swing[], right: number, i: number): TrendLine[] {
  const known = confirmedBy(swings, right, i);
  const out: TrendLine[] = [];
  for (const [type, kind] of [["low", "support"], ["high", "resistance"]] as const) {
    const s = known.filter((x) => x.type === type).slice(-2);
    if (s.length === 2 && s[1].index - s[0].index >= 4) {
      out.push({ kind, from: { index: s[0].index, price: s[0].price }, to: { index: s[1].index, price: s[1].price } });
    }
  }
  return out;
}

export interface ChartPattern {
  name: "Double top" | "Double bottom";
  dir: 1 | -1;
  /** Bar of the second peak/trough. */
  index: number;
  level: number;
}

/** Double tops/bottoms: two swing extremes within 0.3 ATR with a clear pullback between them. */
export function doublePatterns(c: Candle[], swings: Swing[], right: number, atrArr: number[]): ChartPattern[] {
  const out: ChartPattern[] = [];
  for (const type of ["high", "low"] as const) {
    const same = swings.filter((s) => s.type === type);
    for (let k = 1; k < same.length; k++) {
      const a = same[k - 1], b = same[k];
      const at = atrArr[b.index + right] ?? NaN;
      if (Number.isNaN(at) || b.index - a.index < 5 || b.index - a.index > 60) continue;
      if (Math.abs(a.price - b.price) > 0.3 * at) continue;
      let ext = type === "high" ? Infinity : -Infinity;
      for (let j = a.index; j <= b.index; j++) ext = type === "high" ? Math.min(ext, c[j].low) : Math.max(ext, c[j].high);
      const depth = type === "high" ? Math.min(a.price, b.price) - ext : ext - Math.max(a.price, b.price);
      if (depth >= 1.5 * at) {
        out.push({ name: type === "high" ? "Double top" : "Double bottom", dir: type === "high" ? -1 : 1, index: b.index, level: (a.price + b.price) / 2 });
      }
    }
  }
  return out;
}
