import type { Ctx } from "./ctx";

export type Vote = 1 | -1 | 0;

export interface Confluence {
  votes: { name: string; vote: Vote }[];
  bullish: number;
  bearish: number;
  neutral: number;
  /** -100 (all bearish) to +100 (all bullish). Agreement among indicators only. */
  score: number;
  adx: number;
  strength: "weak" | "developing" | "strong";
}

const dir = (cond: boolean, opposite: boolean): Vote => (cond ? 1 : opposite ? -1 : 0);

/** Vote on a signed reading, treating anything within `eps` of zero as flat (floating-point dust is not a signal). */
const sign = (v: number, eps: number): Vote => (v > eps ? 1 : v < -eps ? -1 : 0);

/** Ten classic indicators, each voting bullish / bearish / neutral at bar i. This measures agreement, not probability. */
export function tenInOne(x: Ctx, i: number): Confluence {
  const close = x.c[i].close;
  const eps = Math.abs(close) * 1e-7;
  const votes: Confluence["votes"] = [
    { name: "EMA 9 vs 21", vote: dir(x.ema9[i] > x.ema21[i], x.ema9[i] < x.ema21[i]) },
    { name: "EMA 21 vs 50", vote: dir(x.ema21[i] > x.ema50[i], x.ema21[i] < x.ema50[i]) },
    { name: "Price vs EMA 200", vote: dir(close > x.ema200[i], close < x.ema200[i]) },
    { name: "MACD histogram", vote: sign(x.macdHist[i], eps) },
    { name: "MACD vs signal", vote: sign(x.macdLine[i] - x.macdSig[i], eps) },
    { name: "RSI 14", vote: dir(x.rsi[i] > 55, x.rsi[i] < 45) },
    // Only when K and D agree on a side of 50: saturated readings at the extremes flicker and say little.
    { name: "Stochastic", vote: dir(x.stochK[i] > x.stochD[i] && x.stochK[i] > 50, x.stochK[i] < x.stochD[i] && x.stochK[i] < 50) },
    { name: "Bollinger midline", vote: dir(close > x.bbM[i], close < x.bbM[i]) },
    { name: "ADX / DI", vote: x.adx[i] < 15 ? 0 : dir(x.pdi[i] > x.mdi[i], x.pdi[i] < x.mdi[i]) },
    { name: "Supertrend", vote: x.st.dir[i] === 1 ? 1 : x.st.dir[i] === -1 ? -1 : 0 },
  ];

  const bullish = votes.filter((v) => v.vote === 1).length;
  const bearish = votes.filter((v) => v.vote === -1).length;
  const a = x.adx[i];
  return {
    votes, bullish, bearish, neutral: votes.length - bullish - bearish,
    score: Math.round(((bullish - bearish) / votes.length) * 100),
    adx: a,
    strength: a >= 25 ? "strong" : a >= 20 ? "developing" : "weak",
  };
}
