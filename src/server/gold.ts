import { aggregateCandles, cleanCandles } from "@/lib/data";
import type { Candle } from "@/lib/indicators";

// Twelve Data has no 3-minute interval, so "3m" is built from 1-minute candles.
const INTERVALS: Record<string, string> = {
  "1m": "1min", "3m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1h": "1h", "2h": "2h", "4h": "4h", "1d": "1day", "1w": "1week",
};

/**
 * How long a response is reused before asking Twelve Data again. Slow timeframes change slowly, so they
 * can be reused far longer; this is what keeps the free plan's daily allowance from running out.
 */
export const TTL_MS: Record<string, number> = {
  "1m": 60_000, "3m": 60_000, "5m": 60_000, "15m": 60_000, "30m": 120_000,
  "1h": 180_000, "2h": 300_000, "4h": 600_000, "1d": 900_000, "1w": 3_600_000,
};

/** Stale data is still served (instead of failing) for up to this long when the provider or budget fails. */
const MAX_STALE_MS = 6 * 60 * 60 * 1000;

export class GoldError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface Entry {
  at: number;
  candles: Candle[];
}

export interface GoldDeps {
  fetch: typeof fetch;
  now: () => number;
  /** Upstream calls allowed per UTC day. */
  budget: number;
}

const g = globalThis as unknown as {
  aurumGold?: { cache: Map<string, Entry>; inflight: Map<string, Promise<Candle[]>>; day: number; used: number };
};
const state = (g.aurumGold ??= { cache: new Map(), inflight: new Map(), day: -1, used: 0 });

const defaults = (): GoldDeps => ({
  fetch: (...a) => fetch(...a),
  now: Date.now,
  budget: Number(process.env.GOLD_DAILY_BUDGET ?? 700),
});

/** For tests: forget everything. */
export function resetGoldState() {
  state.cache.clear();
  state.inflight.clear();
  state.day = -1;
  state.used = 0;
}

export const goldUsage = () => ({ day: state.day, used: state.used });

async function fromTwelveData(tf: string, size: number, deps: GoldDeps): Promise<Candle[]> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new GoldError("no-key", 503);
  // "3m" is built from 1-minute candles, so ask for three times as many of those.
  const outputsize = tf === "3m" ? Math.min(5000, size * 3) : Math.min(5000, size);
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${INTERVALS[tf]}&outputsize=${outputsize}&timezone=UTC&apikey=${key}`;
  let body: { status?: string; message?: string; values?: Record<string, string>[] };
  try {
    const res = await deps.fetch(url, { cache: "no-store" });
    body = await res.json();
  } catch {
    throw new GoldError("provider-unreachable", 502);
  }
  if (body.status === "error" || !Array.isArray(body.values)) {
    throw new GoldError(body.message ?? "provider-error", 502);
  }
  const candles = cleanCandles(
    body.values.map((v) => ({
      time: Math.floor(Date.parse(v.datetime.replace(" ", "T") + "Z") / 1000),
      open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +(v.volume ?? 0),
    })),
  );
  return tf === "3m" ? aggregateCandles(candles, 180, 60) : candles;
}

/**
 * XAU/USD candles, oldest first. Key stays server-side.
 * Cached per timeframe, shared between simultaneous callers, limited to a daily budget of upstream calls,
 * and falls back to older data (rather than an error) if the provider fails or the budget is spent.
 * `fresh: true` skips the cache read (used by the background tracker).
 */
export async function fetchGold(
  tf: string,
  opts: { size?: number; fresh?: boolean } = {},
  deps: GoldDeps = defaults(),
): Promise<Candle[]> {
  if (!INTERVALS[tf]) throw new GoldError("bad-timeframe", 400);
  const size = opts.size ?? 3000;
  const cacheKey = `${tf}|${size}`;
  const now = deps.now();
  const hit = state.cache.get(cacheKey);
  if (hit && !opts.fresh && now - hit.at < TTL_MS[tf]) return hit.candles;

  const waiting = state.inflight.get(cacheKey);
  if (waiting) return waiting;

  const stale = hit && now - hit.at < MAX_STALE_MS ? hit.candles : null;
  const day = Math.floor(now / 86_400_000);
  if (state.day !== day) { state.day = day; state.used = 0; }
  if (state.used >= deps.budget) {
    if (stale) return stale;
    throw new GoldError("quota", 503);
  }

  state.used++; // counted when asked, so failures are counted too (the provider bills attempts)
  const job = fromTwelveData(tf, size, deps)
    .then((candles) => {
      state.cache.set(cacheKey, { at: deps.now(), candles });
      return candles;
    })
    .catch((e: unknown) => {
      if (stale) return stale;
      throw e;
    })
    .finally(() => state.inflight.delete(cacheKey));
  state.inflight.set(cacheKey, job);
  return job;
}
