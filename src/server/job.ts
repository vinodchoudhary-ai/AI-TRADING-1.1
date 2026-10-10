import { analyze } from "@/lib/analysis/analyze";
import { COST_PCT } from "@/lib/costs";
import { fetchBinanceHistory, TF_SECONDS, type Timeframe } from "@/lib/data";
import { addSignal, resolveAll, toStored } from "@/lib/history";
import type { Candle } from "@/lib/indicators";
import { listSignals, saveSignals } from "./db";
import { fetchGold } from "./gold";
import { markPassDone, markTrackerStarted } from "./status";

// Few markets/timeframes keep us inside Twelve Data's free quota; gold reuses the page's cached responses.
const TARGETS = [
  { symbol: "XAUUSD", tf: "15m" },
  { symbol: "XAUUSD", tf: "1h" },
  { symbol: "BTCUSD", tf: "15m" },
  { symbol: "BTCUSD", tf: "1h" },
  { symbol: "BTCUSD", tf: "4h" },
] as const;

type Target = (typeof TARGETS)[number];

/**
 * One tracking pass for one market and timeframe: settle open signals against the candles that followed
 * them, then record whatever setups every strategy has on the last closed candle (with its backtest label
 * at this moment). This is the forward test: signals are stored before their outcome is known.
 */
export function trackTarget(
  symbol: Target["symbol"], tf: Timeframe, candles: Candle[], nowSec: number,
): { added: number; settled: number } {
  const opts = { costPct: COST_PCT[symbol] };
  const before = listSignals(symbol, tf);
  let list = resolveAll(before, symbol, tf, candles, { costPct: opts.costPct, maxHold: 48 });
  const settled = list.filter((s, i) => before[i].outcome === "open" && s.outcome !== "open").length;
  const a = analyze(candles, TF_SECONDS[tf], { ...opts, nowSec });
  if (a) {
    const time = candles[a.closedIndex].time;
    for (const s of a.live) list = addSignal(list, toStored(symbol, tf, time, s, s.tier));
  }
  saveSignals(list);
  return { added: list.length - before.length, settled };
}

export async function runOnce(): Promise<void> {
  let added = 0, settled = 0, ok = 0;
  for (const { symbol, tf } of TARGETS) {
    try {
      const candles = symbol === "BTCUSD" ? await fetchBinanceHistory(tf) : await fetchGold(tf);
      const r = trackTarget(symbol, tf, candles, Math.floor(Date.now() / 1000));
      added += r.added;
      settled += r.settled;
      ok++;
    } catch (e) {
      console.warn(`[job] ${symbol} ${tf} skipped:`, e instanceof Error ? e.message : e);
    }
  }
  markPassDone({ ok, total: TARGETS.length, added, settled });
  console.log(`[job] pass done: ${ok}/${TARGETS.length} targets, ${added} new signal(s), ${settled} settled`);
}

const g = globalThis as unknown as { aurumJob?: NodeJS.Timeout };

export function startJob(): void {
  if (g.aurumJob) return; // survive dev hot-reloads without duplicating timers
  const minutes = Math.max(1, Number(process.env.JOB_INTERVAL_MIN ?? 10));
  markTrackerStarted(minutes);
  void runOnce();
  g.aurumJob = setInterval(() => void runOnce(), minutes * 60_000);
  console.log(`[job] signal tracker started, every ${minutes} min`);
}
