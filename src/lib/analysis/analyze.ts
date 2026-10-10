import type { Candle } from "../indicators";
import { runBacktest, DEFAULT_OPTIONS, type BacktestOptions, type StrategyResult, type Tier } from "./backtest";
import { tenInOne, type Confluence } from "./confluence";
import { buildCtx, type Ctx } from "./ctx";
import { STRATEGIES, WARMUP, type Setup } from "./strategies";

export interface LiveSetup extends Setup {
  tier: Tier;
  /** Measured results of this strategy on this market and timeframe. */
  result: StrategyResult;
}

export interface Analysis {
  /** Built from closed candles only, so statistics and signals don't shift while a candle forms. */
  ctx: Ctx;
  results: StrategyResult[];
  /** Index (in the series passed in) of the last closed candle; setups are taken from it. */
  closedIndex: number;
  /** Setups found on the last closed candle, strongest evidence first. Re-check with `isActionable`. */
  live: LiveSetup[];
  confluence: Confluence;
}

/** The newest candle may still be forming; use the one before it unless it has already closed. */
export function lastClosedIndex(c: Candle[], tfSec: number, nowSec: number): number {
  const n = c.length;
  return c[n - 1].time + tfSec <= nowSec ? n - 1 : n - 2;
}

const RANK: Record<Tier, number> = { proven: 2, promising: 1, unproven: 0 };

/**
 * A setup is actionable only while price hasn't touched its stop or target since it formed
 * and is still within one ATR of the entry. `after` = candles newer than the setup bar.
 */
export function isActionable(s: Setup, after: Candle[], atrAtSetup: number): boolean {
  for (const k of after) {
    const hitSl = s.dir === 1 ? k.low <= s.sl : k.high >= s.sl;
    const hitTp = s.dir === 1 ? k.high >= s.tp : k.low <= s.tp;
    if (hitSl || hitTp) return false;
  }
  const price = after.length ? after[after.length - 1].close : s.entry;
  return Math.abs(price - s.entry) <= atrAtSetup;
}

/** The setup with a measured edge that the headline should show, if there is one. */
export const bestSetup = (live: LiveSetup[]): LiveSetup | null => live.find((s) => s.tier !== "unproven") ?? null;

export function analyze(
  c: Candle[], tfSec: number, opts: Partial<BacktestOptions> & { nowSec?: number } = {},
): Analysis | null {
  const { nowSec = Math.floor(Date.now() / 1000), ...bt } = opts;
  if (c.length < 2) return null;
  const closedIndex = lastClosedIndex(c, tfSec, nowSec);
  if (closedIndex + 1 < WARMUP + 40) return null;

  const x = buildCtx(closedIndex === c.length - 1 ? c : c.slice(0, closedIndex + 1));
  const results = runBacktest(x, STRATEGIES, { ...DEFAULT_OPTIONS, ...bt });

  const live: LiveSetup[] = [];
  for (const strat of STRATEGIES) {
    const s = strat.run(x, x.n - 1);
    if (!s) continue;
    const result = results.find((r) => r.id === strat.id)!;
    live.push({ ...s, tier: result.tier, result });
  }
  live.sort((a, b) => RANK[b.tier] - RANK[a.tier] || b.result.all.expectancy - a.result.all.expectancy);
  return { ctx: x, results, closedIndex, live, confluence: tenInOne(x, x.n - 1) };
}
