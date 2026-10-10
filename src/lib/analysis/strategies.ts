import type { Ctx } from "./ctx";
import { confirmedBy } from "./structure";
import { activeAt, srZonesAt, type Zone } from "./zones";

export interface Setup {
  strategy: string;
  name: string;
  dir: 1 | -1;
  /** Bar the setup was found on (its close is the entry reference). */
  index: number;
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  reasons: string[];
}

export interface Strategy {
  id: string;
  name: string;
  /** Short plain-language description for the UI. */
  about: string;
  run(x: Ctx, i: number): Setup | null;
}

/** Bars needed before the 200-period average (and everything else) is trustworthy. */
export const WARMUP = 210;
export const MIN_RR = 1.5;

/** Builds a setup, or null if risk is absurdly tight/wide or the reward:risk is under the floor. */
function build(
  x: Ctx, i: number, s: Pick<Strategy, "id" | "name">, dir: 1 | -1, sl: number, rrOrTp: { rr: number } | { tp: number }, reasons: string[],
): Setup | null {
  const entry = x.c[i].close;
  const a = x.atr[i];
  const risk = (entry - sl) * dir;
  if (!(risk > 0) || risk < 0.3 * a || risk > 3 * a) return null;
  const tp = "tp" in rrOrTp ? rrOrTp.tp : entry + dir * rrOrTp.rr * risk;
  const rr = ((tp - entry) * dir) / risk;
  if (!(rr >= MIN_RR)) return null;
  return { strategy: s.id, name: s.name, dir, index: i, entry, sl, tp, rr, reasons };
}

const range = (x: Ctx, i: number) => x.c[i].high - x.c[i].low;

const trendPullback: Strategy = {
  id: "pullback",
  name: "Trend pullback",
  about: "Buy dips to the 21 EMA in a confirmed up-trend (sell rallies in a down-trend), after a rejection candle.",
  run(x, i) {
    if (i < WARMUP) return null;
    const a = x.atr[i], k = x.c[i];
    const up = x.ema21[i] > x.ema50[i] && k.close > x.ema200[i] && x.adx[i] > 20 && x.pdi[i] > x.mdi[i];
    const down = x.ema21[i] < x.ema50[i] && k.close < x.ema200[i] && x.adx[i] > 20 && x.mdi[i] > x.pdi[i];
    if (up && k.low <= x.ema21[i] + 0.25 * a && k.close > x.ema21[i] && k.close > k.open
        && x.rsi[i] > 40 && x.rsi[i] < 65 && x.rsi[i] > x.rsi[i - 1]) {
      const sl = Math.min(k.low, x.c[i - 1].low) - 0.3 * a;
      return build(x, i, this, 1, sl, { rr: 2.5 }, ["Up-trend: EMA 21 > 50, price > EMA 200, ADX > 20", "Pulled back to the 21 EMA and closed back above it", "RSI turning up"]);
    }
    if (down && k.high >= x.ema21[i] - 0.25 * a && k.close < x.ema21[i] && k.close < k.open
        && x.rsi[i] < 60 && x.rsi[i] > 35 && x.rsi[i] < x.rsi[i - 1]) {
      const sl = Math.max(k.high, x.c[i - 1].high) + 0.3 * a;
      return build(x, i, this, -1, sl, { rr: 2.5 }, ["Down-trend: EMA 21 < 50, price < EMA 200, ADX > 20", "Rallied to the 21 EMA and closed back below it", "RSI turning down"]);
    }
    return null;
  },
};

const sweepReversal: Strategy = {
  id: "sweep",
  name: "Liquidity sweep reversal",
  about: "Price spikes through a recent swing high/low (grabbing stops) then closes back inside with a rejection candle.",
  run(x, i) {
    if (i < WARMUP) return null;
    const a = x.atr[i], k = x.c[i], r = range(x, i);
    if (r < 0.8 * a) return null;
    const recent = confirmedBy(x.swings, x.right, i).filter((s) => s.index > i - 40);
    for (const s of [...recent].reverse()) {
      let intact = true; // the level must not have been taken out already
      for (let j = s.index + 1; j < i; j++) {
        if (s.type === "high" ? x.c[j].high > s.price : x.c[j].low < s.price) { intact = false; break; }
      }
      if (!intact) continue;
      if (s.type === "high" && k.high > s.price && k.close < s.price && k.close < k.open
          && k.high - Math.max(k.open, k.close) >= 0.4 * r) {
        return build(x, i, this, -1, k.high + 0.2 * a, { rr: 2 }, ["Swept a swing high and closed back below it", "Long upper wick: rejection", "Stops above the sweep"]);
      }
      if (s.type === "low" && k.low < s.price && k.close > s.price && k.close > k.open
          && Math.min(k.open, k.close) - k.low >= 0.4 * r) {
        return build(x, i, this, 1, k.low - 0.2 * a, { rr: 2 }, ["Swept a swing low and closed back above it", "Long lower wick: rejection", "Stops below the sweep"]);
      }
    }
    return null;
  },
};

const breakoutRetest: Strategy = {
  id: "retest",
  name: "Breakout and retest",
  about: "Price breaks a support/resistance zone with strong momentum, then comes back to retest it and holds.",
  run(x, i) {
    if (i < WARMUP) return null;
    const a = x.atr[i], k = x.c[i];
    for (const z of srZonesAt(x.c, x.swings, x.right, i, a)) {
      for (let b = Math.max(1, i - 15); b < i; b++) {
        const body = Math.abs(x.c[b].close - x.c[b].open);
        // first close above the zone, with an expansion candle
        if (x.c[b].close > z.top && x.c[b - 1].close <= z.top && body >= 0.8 * x.atr[b]) {
          let held = true;
          for (let j = b + 1; j < i; j++) if (x.c[j].close < z.bottom) { held = false; break; }
          if (held && k.low <= z.top + 0.15 * a && k.close > z.top && k.close > k.open && k.close > x.ema50[i]) {
            const sl = Math.min(z.bottom, k.low) - 0.3 * a;
            return build(x, i, this, 1, sl, { rr: 2 }, ["Broke resistance with a strong candle", "Retested the zone from above and held", "Price above the 50 EMA"]);
          }
        }
        if (x.c[b].close < z.bottom && x.c[b - 1].close >= z.bottom && body >= 0.8 * x.atr[b]) {
          let held = true;
          for (let j = b + 1; j < i; j++) if (x.c[j].close > z.top) { held = false; break; }
          if (held && k.high >= z.bottom - 0.15 * a && k.close < z.bottom && k.close < k.open && k.close < x.ema50[i]) {
            const sl = Math.max(z.top, k.high) + 0.3 * a;
            return build(x, i, this, -1, sl, { rr: 2 }, ["Broke support with a strong candle", "Retested the zone from below and failed", "Price below the 50 EMA"]);
          }
        }
      }
    }
    return null;
  },
};

const smartMoney: Strategy = {
  id: "smc",
  name: "Smart money: BOS + order block / FVG",
  about: "After a break of structure, enter when price returns to the order block or fair value gap that caused it.",
  run(x, i) {
    if (i < WARMUP) return null;
    const ev = [...x.structure.events].reverse().find((e) => e.index <= i && e.index >= i - 40);
    if (!ev || x.structure.trend[i] !== ev.dir) return null;
    const a = x.atr[i], k = x.c[i];
    const zones: Zone[] = [
      ...x.obs.filter((z) => z.dir === ev.dir && z.from === ev.index),
      ...x.fvgs.filter((z) => z.dir === ev.dir && z.from >= ev.index - 3),
    ].filter((z) => activeAt(z, i) && z.from < i);
    for (const z of zones) {
      const label = z.kind === "ob" ? "order block" : "fair value gap";
      if (ev.dir === 1 && k.low <= z.top && k.close > z.bottom && k.close > k.open) {
        return build(x, i, this, 1, z.bottom - 0.2 * a, { rr: 2.5 }, [`${ev.kind} to the upside`, `Retested a bullish ${label} and rejected`, "Entering with the break"]);
      }
      if (ev.dir === -1 && k.high >= z.bottom && k.close < z.top && k.close < k.open) {
        return build(x, i, this, -1, z.top + 0.2 * a, { rr: 2.5 }, [`${ev.kind} to the downside`, `Retested a bearish ${label} and rejected`, "Entering with the break"]);
      }
    }
    return null;
  },
};

const rangeFade: Strategy = {
  id: "range",
  name: "Range fade (Bollinger)",
  about: "In a sideways market (ADX under 20) fade a push outside the Bollinger band back toward the middle.",
  run(x, i) {
    if (i < WARMUP || !(x.adx[i] < 20)) return null;
    const a = x.atr[i], k = x.c[i];
    if (k.low <= x.bbL[i] && k.close > x.bbL[i] && k.close > k.open && x.rsi[i] < 40) {
      return build(x, i, this, 1, k.low - 0.3 * a, { tp: x.bbM[i] }, ["Sideways market: ADX under 20", "Pierced the lower band and closed back inside", "Target: middle band"]);
    }
    if (k.high >= x.bbU[i] && k.close < x.bbU[i] && k.close < k.open && x.rsi[i] > 60) {
      return build(x, i, this, -1, k.high + 0.3 * a, { tp: x.bbM[i] }, ["Sideways market: ADX under 20", "Pierced the upper band and closed back inside", "Target: middle band"]);
    }
    return null;
  },
};

const scalpMomentum: Strategy = {
  id: "scalp",
  name: "Momentum cross (scalp)",
  about: "EMA 9 crosses EMA 21 with MACD and RSI backing the move, in the direction of the 50 EMA.",
  run(x, i) {
    if (i < WARMUP) return null;
    const a = x.atr[i], k = x.c[i];
    const crossUp = x.ema9[i - 1] <= x.ema21[i - 1] && x.ema9[i] > x.ema21[i];
    const crossDn = x.ema9[i - 1] >= x.ema21[i - 1] && x.ema9[i] < x.ema21[i];
    if (crossUp && x.macdHist[i] > 0 && x.macdHist[i] > x.macdHist[i - 1] && x.rsi[i] > 50 && x.rsi[i] < 70 && k.close > x.ema50[i] && x.adx[i] >= 18) {
      return build(x, i, this, 1, k.close - 1.2 * a, { rr: 2 }, ["EMA 9 crossed above EMA 21", "MACD histogram positive and rising", "RSI 50-70, price above the 50 EMA"]);
    }
    if (crossDn && x.macdHist[i] < 0 && x.macdHist[i] < x.macdHist[i - 1] && x.rsi[i] < 50 && x.rsi[i] > 30 && k.close < x.ema50[i] && x.adx[i] >= 18) {
      return build(x, i, this, -1, k.close + 1.2 * a, { rr: 2 }, ["EMA 9 crossed below EMA 21", "MACD histogram negative and falling", "RSI 30-50, price below the 50 EMA"]);
    }
    return null;
  },
};

export const STRATEGIES: Strategy[] = [trendPullback, sweepReversal, breakoutRetest, smartMoney, rangeFade, scalpMomentum];
