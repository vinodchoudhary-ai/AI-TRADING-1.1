import type { Candle } from "../indicators";
import type { Ctx } from "./ctx";
import { WARMUP, type Setup, type Strategy } from "./strategies";

export interface Trade {
  index: number;
  time: number;
  dir: 1 | -1;
  entry: number;
  sl: number;
  tp: number;
  plannedRR: number;
  exitIndex: number;
  outcome: "win" | "loss" | "timeout";
  /** Result in multiples of the planned risk, after execution cost. */
  r: number;
}

export interface BacktestOptions {
  /** Execution cost as a fraction of price, charged against the entry (spread + slippage). */
  costPct: number;
  /** Bars a trade may stay open before it is closed at the market. */
  maxHold: number;
}

export const DEFAULT_OPTIONS: BacktestOptions = { costPct: 0.0001, maxHold: 48 };

/**
 * Replays one setup bar by bar. A candle that touches both stop and target counts as a loss
 * (we can't know the order). Returns null if the data ends before the trade resolves.
 */
export function simulateTrade(c: Candle[], s: Setup, opts: BacktestOptions = DEFAULT_OPTIONS): Trade | null {
  const risk = Math.abs(s.entry - s.sl);
  const fill = s.entry * (1 + s.dir * opts.costPct); // worse price for the trader
  const rOf = (price: number) => ((price - fill) * s.dir) / risk;
  const last = Math.min(c.length - 1, s.index + opts.maxHold);
  for (let j = s.index + 1; j <= last; j++) {
    const hitSl = s.dir === 1 ? c[j].low <= s.sl : c[j].high >= s.sl;
    const hitTp = s.dir === 1 ? c[j].high >= s.tp : c[j].low <= s.tp;
    if (hitSl) return trade(s, c, j, "loss", rOf(s.sl));
    if (hitTp) return trade(s, c, j, "win", rOf(s.tp));
  }
  if (s.index + opts.maxHold <= c.length - 1) return trade(s, c, last, "timeout", rOf(c[last].close));
  return null; // still open when the data ends: not counted either way
}

const trade = (s: Setup, c: Candle[], exitIndex: number, outcome: Trade["outcome"], r: number): Trade => ({
  index: s.index, time: c[s.index].time, dir: s.dir, entry: s.entry, sl: s.sl, tp: s.tp,
  plannedRR: s.rr, exitIndex, outcome, r,
});

export interface Stats {
  n: number;
  wins: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  /** Average R per trade. Positive means the strategy made money on this sample. */
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
  avgPlannedRR: number;
  /** Lower end of a 95% confidence interval for the true win rate. */
  winRateLow: number;
  /** Win rate needed just to break even at the planned reward:risk. */
  breakEven: number;
}

/** Wilson score interval lower bound. */
export function wilsonLow(wins: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const p = wins / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

export function computeStats(trades: Trade[]): Stats {
  const n = trades.length;
  if (n === 0) {
    return { n: 0, wins: 0, winRate: 0, avgWinR: 0, avgLossR: 0, expectancy: 0, profitFactor: 0, maxDrawdownR: 0, avgPlannedRR: 0, winRateLow: 0, breakEven: 0.5 };
  }
  const wins = trades.filter((t) => t.r > 0);
  const losses = trades.filter((t) => t.r <= 0);
  const sum = (a: Trade[]) => a.reduce((s, t) => s + t.r, 0);
  let peak = 0, cum = 0, dd = 0;
  for (const t of trades) {
    cum += t.r;
    peak = Math.max(peak, cum);
    dd = Math.max(dd, peak - cum);
  }
  const grossWin = sum(wins);
  const grossLoss = Math.abs(sum(losses));
  const plannedRR = trades.reduce((s, t) => s + t.plannedRR, 0) / n;
  return {
    n, wins: wins.length, winRate: wins.length / n,
    avgWinR: wins.length ? grossWin / wins.length : 0,
    avgLossR: losses.length ? -grossLoss / losses.length : 0,
    expectancy: sum(trades) / n,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : grossWin / grossLoss,
    maxDrawdownR: dd,
    avgPlannedRR: plannedRR,
    winRateLow: wilsonLow(wins.length, n),
    breakEven: 1 / (1 + plannedRR),
  };
}

/**
 * proven     – enough trades, win rate demonstrably above break-even (95%), positive expectancy,
 *              and still positive on the held-back recent 30% of history.
 * promising  – at least 20 trades, a clearly positive average (> +0.15R), and positive on the
 *              held-back recent data too. On pure random prices (where no edge exists) this label
 *              was earned by 0.3% of strategy runs, versus 9.8% for a looser "any positive" rule.
 * unproven   – anything else. This is the honest default.
 */
export type Tier = "proven" | "promising" | "unproven";

export function classify(all: Stats, test: Stats): Tier {
  if (all.n >= 30 && all.winRateLow > all.breakEven && all.expectancy > 0 && test.n >= 8 && test.expectancy > 0) return "proven";
  if (all.n >= 20 && all.expectancy > 0.15 && test.n >= 5 && test.expectancy > 0) return "promising";
  return "unproven";
}

export interface StrategyResult {
  id: string;
  name: string;
  trades: Trade[];
  all: Stats;
  /** First 70% of the history. */
  train: Stats;
  /** Most recent 30%, kept apart as a sanity check against overfitting. */
  test: Stats;
  tier: Tier;
}

export function runBacktest(x: Ctx, strategies: Strategy[], opts: BacktestOptions = DEFAULT_OPTIONS): StrategyResult[] {
  const cutoff = WARMUP + Math.floor(0.7 * (x.n - WARMUP));
  return strategies.map((strat) => {
    const trades: Trade[] = [];
    let busyUntil = -1; // one trade at a time per strategy
    for (let i = WARMUP; i < x.n - 1; i++) {
      if (i <= busyUntil) continue;
      const s = strat.run(x, i);
      if (!s) continue;
      const t = simulateTrade(x.c, s, opts);
      if (!t) break; // data ended with this one still open
      trades.push(t);
      busyUntil = t.exitIndex;
    }
    const train = computeStats(trades.filter((t) => t.index < cutoff));
    const test = computeStats(trades.filter((t) => t.index >= cutoff));
    const all = computeStats(trades);
    return { id: strat.id, name: strat.name, trades, all, train, test, tier: classify(all, test) };
  });
}
