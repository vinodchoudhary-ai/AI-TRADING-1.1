import type { Candle } from "../indicators";

export const T0 = 1_700_000_000;

/** Seeded multi-regime market: trends up, ranges, trends down, with spikes. Deterministic. For tests only. */
export function market(n: number, seed = 7, base = 2000, step = 900): Candle[] {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const out: Candle[] = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    const phase = Math.floor(i / 220) % 4;
    const drift = phase === 0 ? 0.0006 : phase === 2 ? -0.0006 : 0;
    const pull = phase === 1 || phase === 3 ? (base - price) * 0.01 : 0;
    const vol = 0.0035 * (1 + (rnd() < 0.04 ? 2 : 0));
    const open = price;
    const close = open * (1 + drift + (rnd() - 0.5) * 2 * vol) + pull * 0.05;
    const high = Math.max(open, close) * (1 + rnd() * vol);
    const low = Math.min(open, close) * (1 - rnd() * vol);
    out.push({ time: T0 + i * step, open, high, low, close, volume: Math.round(100 + rnd() * 900) });
    price = close;
  }
  return out;
}
