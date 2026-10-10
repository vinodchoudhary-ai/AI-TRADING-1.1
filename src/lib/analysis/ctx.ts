import { atr, ema, rsi, type Candle } from "../indicators";
import { adx, bollinger, hasVolume, macd, obv, stochastic, supertrend, vwapDaily } from "../ta";
import { allCandlePatterns, doublePatterns, type CandlePattern, type ChartPattern } from "./patterns";
import { analyzeStructure, findSwings, type Structure, type Swing } from "./structure";
import { findFvgs, findOrderBlocks, periodLevels, type Zone } from "./zones";

export const SWING_LEFT = 3;
export const SWING_RIGHT = 3;

/** Everything the strategies and overlays need, computed once per candle series. */
export interface Ctx {
  c: Candle[];
  n: number;
  right: number;
  hasVolume: boolean;
  ema9: number[]; ema21: number[]; ema50: number[]; ema200: number[];
  rsi: number[]; atr: number[];
  adx: number[]; pdi: number[]; mdi: number[];
  bbU: number[]; bbM: number[]; bbL: number[];
  macdLine: number[]; macdSig: number[]; macdHist: number[];
  stochK: number[]; stochD: number[];
  st: { line: number[]; dir: number[] };
  vwap: number[]; obv: number[];
  swings: Swing[];
  structure: Structure;
  fvgs: Zone[];
  obs: Zone[];
  levels: { pdh: number[]; pdl: number[]; pwh: number[]; pwl: number[] };
  patterns: CandlePattern[];
  chartPatterns: ChartPattern[];
}

export function buildCtx(c: Candle[]): Ctx {
  const close = c.map((x) => x.close);
  const a = atr(c, 14);
  const dmi = adx(c, 14);
  const bb = bollinger(close, 20, 2);
  const m = macd(close);
  const sto = stochastic(c, 14, 3);
  const swings = findSwings(c, SWING_LEFT, SWING_RIGHT);
  const structure = analyzeStructure(c, swings, SWING_RIGHT);
  return {
    c, n: c.length, right: SWING_RIGHT, hasVolume: hasVolume(c),
    ema9: ema(close, 9), ema21: ema(close, 21), ema50: ema(close, 50), ema200: ema(close, 200),
    rsi: rsi(close, 14), atr: a,
    adx: dmi.adx, pdi: dmi.plusDI, mdi: dmi.minusDI,
    bbU: bb.upper, bbM: bb.mid, bbL: bb.lower,
    macdLine: m.line, macdSig: m.signal, macdHist: m.hist,
    stochK: sto.k, stochD: sto.d,
    st: supertrend(c, 10, 3),
    vwap: vwapDaily(c), obv: obv(c),
    swings, structure,
    fvgs: findFvgs(c, a), obs: findOrderBlocks(c, structure),
    levels: periodLevels(c),
    patterns: allCandlePatterns(c, a),
    chartPatterns: doublePatterns(c, swings, SWING_RIGHT, a),
  };
}
