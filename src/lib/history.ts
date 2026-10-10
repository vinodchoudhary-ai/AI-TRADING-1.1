import type { Tier } from "./analysis/backtest";
import { DEFAULT_OPTIONS, simulateTrade, type BacktestOptions } from "./analysis/backtest";
import type { Setup } from "./analysis/strategies";
import type { Candle } from "./indicators";

/** expired = too old to resolve from the candles we hold (excluded from every statistic). */
export type Outcome = "open" | "win" | "loss" | "timeout" | "expired";

export interface StoredSignal {
  /** symbol|tf|strategy|candleTime (older rows: symbol|tf|candleTime). */
  id: string;
  symbol: string;
  tf: string;
  /** Time of the candle the signal was generated on. */
  time: number;
  /** "legacy" = the original single EMA/RSI/ATR rule. */
  strategy: string;
  /** The strategy's backtest label at the moment the signal appeared. null for legacy rows. */
  tier: Tier | null;
  direction: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  /** Planned reward:risk. */
  rr: number;
  outcome: Outcome;
  /** Result in multiples of the planned risk, after cost. Unset for legacy rows and open signals. */
  r?: number;
  resolvedAt?: number;
}

export function toStored(symbol: string, tf: string, time: number, s: Setup, tier: Tier): StoredSignal {
  return {
    id: `${symbol}|${tf}|${s.strategy}|${time}`, symbol, tf, time, strategy: s.strategy, tier,
    direction: s.dir === 1 ? "BUY" : "SELL", entry: s.entry, stopLoss: s.sl, takeProfit: s.tp, rr: s.rr,
    outcome: "open",
  };
}

/**
 * Settles an open signal by replaying the candles after it with exactly the backtest's rules (stop/target
 * checked candle by candle, both-in-one-candle counts as a loss, costs charged, closed at the market after
 * `maxHold` bars). Stays open until the data can decide it.
 */
export function resolveStored(s: StoredSignal, c: Candle[], opts: BacktestOptions = DEFAULT_OPTIONS): StoredSignal {
  if (s.outcome !== "open" || c.length === 0) return s;
  if (s.time < c[0].time) return { ...s, outcome: "expired" };
  const index = c.findIndex((k) => k.time === s.time);
  if (index < 0) return s;
  const trade = simulateTrade(
    c,
    { strategy: s.strategy, name: s.strategy, dir: s.direction === "BUY" ? 1 : -1, index, entry: s.entry, sl: s.stopLoss, tp: s.takeProfit, rr: s.rr, reasons: [] },
    opts,
  );
  if (!trade) return s;
  return { ...s, outcome: trade.outcome, r: trade.r, resolvedAt: c[trade.exitIndex].time };
}

export function resolveAll(list: StoredSignal[], symbol: string, tf: string, candles: Candle[], opts?: BacktestOptions): StoredSignal[] {
  return list.map((s) => (s.symbol === symbol && s.tf === tf ? resolveStored(s, candles, opts) : s));
}

/**
 * Adds a signal unless it is already stored, or the same strategy on the same market and timeframe still
 * has an open signal in the same direction (so a persistent setup isn't logged on every candle).
 */
export function addSignal(list: StoredSignal[], s: StoredSignal): StoredSignal[] {
  if (list.some((x) => x.id === s.id)) return list;
  const lastSame = list.filter((x) => x.symbol === s.symbol && x.tf === s.tf && x.strategy === s.strategy).at(-1);
  if (lastSame && lastSame.outcome === "open" && lastSame.direction === s.direction) return list;
  return [...list, s];
}

export const MIN_SAMPLE = 20;

export interface HistoryStats {
  wins: number;
  losses: number;
  open: number;
  resolved: number;
  /** null until MIN_SAMPLE signals have resolved, so a lucky start can't look like skill. */
  winRate: number | null;
  /** Average R per resolved signal; null if none carry an R value (legacy rows). */
  expectancy: number | null;
}

const isResolved = (s: StoredSignal) => s.outcome === "win" || s.outcome === "loss" || s.outcome === "timeout";
const isWin = (s: StoredSignal) => (s.r !== undefined ? s.r > 0 : s.outcome === "win");

export function stats(list: StoredSignal[]): HistoryStats {
  const resolvedList = list.filter(isResolved);
  const wins = resolvedList.filter(isWin).length;
  const withR = resolvedList.filter((s) => s.r !== undefined);
  return {
    wins,
    losses: resolvedList.length - wins,
    open: list.filter((s) => s.outcome === "open").length,
    resolved: resolvedList.length,
    winRate: resolvedList.length >= MIN_SAMPLE ? wins / resolvedList.length : null,
    expectancy: withR.length ? withR.reduce((a, s) => a + (s.r as number), 0) / withR.length : null,
  };
}

export function statsByStrategy(list: StoredSignal[]): { strategy: string; stats: HistoryStats }[] {
  const names = [...new Set(list.map((s) => s.strategy))].sort();
  return names.map((strategy) => ({ strategy, stats: stats(list.filter((s) => s.strategy === strategy)) }));
}
