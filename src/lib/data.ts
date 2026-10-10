import type { Candle } from "./indicators";

export type Symbol = "BTCUSD" | "XAUUSD";
export const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400, "1w": 604800,
};

export interface Series {
  candles: Candle[];
  /** "live" = real market data; "sample" = synthetic, clearly labelled in UI */
  source: "live" | "sample";
}

/** How many candles of history the analysis and backtests work from. */
export const HISTORY = 3000;
/** How many of the newest candles each 15-second refresh asks for. */
export const TAIL = 6;

/** Real BTC/USDT candles from Binance's public API (no key), including taker-buy volume. Oldest first. */
export async function fetchBinance(tf: Timeframe, limit = 1000, endTimeMs?: number): Promise<Candle[]> {
  const end = endTimeMs === undefined ? "" : `&endTime=${endTimeMs}`;
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${tf}&limit=${limit}${end}`,
  );
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const rows: string[][] & number[][] = await res.json();
  return rows.map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5], buyVolume: +r[9],
  }));
}

/** Binance returns at most 1000 candles per call, so older history is fetched page by page. */
export async function fetchBinanceHistory(tf: Timeframe, total = HISTORY): Promise<Candle[]> {
  let all: Candle[] = [];
  let end: number | undefined;
  while (all.length < total) {
    const want = Math.min(1000, total - all.length);
    const page = await fetchBinance(tf, want, end);
    if (page.length === 0) break;
    all = [...page, ...all];
    end = page[0].time * 1000 - 1;
    if (page.length < want) break; // reached the start of the market's history
  }
  return all;
}

/**
 * Puts freshly fetched newest candles onto an existing series: the overlapping tail is replaced
 * (the forming candle changes), new candles are appended. Keeps at most `cap` candles.
 */
export function mergeCandles(base: Candle[], latest: Candle[], cap = 6000): Candle[] {
  if (latest.length === 0) return base;
  const cut = base.findIndex((k) => k.time >= latest[0].time);
  const merged = cut === -1 ? [...base, ...latest] : [...base.slice(0, cut), ...latest];
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

/**
 * Sorts by time, drops duplicate timestamps (keeping the last) and candles with missing or impossible
 * prices. Charts require strictly increasing times, and feeds occasionally repeat or garble a row.
 */
export function cleanCandles(c: Candle[]): Candle[] {
  const ok = c.filter(
    (k) =>
      Number.isFinite(k.time) && [k.open, k.high, k.low, k.close].every((v) => Number.isFinite(v) && v > 0) &&
      k.high >= k.low && k.high >= Math.max(k.open, k.close) && k.low <= Math.min(k.open, k.close),
  );
  const byTime = new Map<number, Candle>();
  for (const k of ok) byTime.set(k.time, k);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Merges small candles into larger ones (e.g. 1m into 3m). A leading partial bucket is dropped. */
export function aggregateCandles(c: Candle[], bucketSec: number, fromSec: number): Candle[] {
  const per = Math.round(bucketSec / fromSec);
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let count = 0;
  for (const x of c) {
    const t = Math.floor(x.time / bucketSec) * bucketSec;
    if (!cur || cur.time !== t) {
      if (cur && (out.length > 0 || count >= per)) out.push(cur);
      cur = { time: t, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume };
      count = 1;
    } else {
      cur.high = Math.max(cur.high, x.high);
      cur.low = Math.min(cur.low, x.low);
      cur.close = x.close;
      cur.volume += x.volume;
      count++;
    }
  }
  if (cur && (out.length > 0 || count >= per)) out.push(cur);
  return out;
}

/** Deterministic synthetic candles (seeded) around a gold-like price. */
export function sampleCandles(tf: Timeframe, count = HISTORY, base = 2650): Candle[] {
  const step = TF_SECONDS[tf];
  const now = Math.floor(Date.now() / 1000 / step) * step;
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  let price = base;
  const out: Candle[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const open = price;
    const drift = (rnd() - 0.5) * base * 0.002;
    const close = open + drift;
    const high = Math.max(open, close) + rnd() * base * 0.0007;
    const low = Math.min(open, close) - rnd() * base * 0.0007;
    out.push({ time: now - i * step, open, high, low, close, volume: Math.round(100 + rnd() * 900) });
    price = close;
  }
  return out;
}

async function loadGold(tf: Timeframe, tail?: number): Promise<Series> {
  // Real gold via our server route (Twelve Data); sample data if no key is configured.
  try {
    const res = await fetch(`/api/gold?tf=${tf}${tail ? `&tail=${tail}` : ""}`);
    if (res.ok) return { candles: (await res.json()).candles, source: "live" };
  } catch {
    /* fall through to sample */
  }
  return { candles: sampleCandles(tf, tail ?? HISTORY), source: "sample" };
}

/** Full history for a market and timeframe. Loaded once; use `loadLatest` to keep it current. */
export async function loadHistory(symbol: Symbol, tf: Timeframe): Promise<Series> {
  if (symbol === "BTCUSD") return { candles: await fetchBinanceHistory(tf), source: "live" };
  return loadGold(tf);
}

/** Just the newest few candles, to merge onto a series with `mergeCandles`. */
export async function loadLatest(symbol: Symbol, tf: Timeframe): Promise<Series> {
  if (symbol === "BTCUSD") return { candles: await fetchBinance(tf, TAIL), source: "live" };
  return loadGold(tf, TAIL);
}
