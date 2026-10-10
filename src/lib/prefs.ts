import { TIMEFRAMES } from "./data";

// Single source of truth for the settings an account can save.
// Plain module (no "use client") so server routes can import it too.
export const LANGS = ["en", "hi"] as const;
export const THEMES = ["system", "light", "dark"] as const;
export const SYMBOLS = ["XAUUSD", "BTCUSD"] as const;
export { TIMEFRAMES };

export interface Prefs {
  lang: (typeof LANGS)[number];
  theme: (typeof THEMES)[number];
  symbol: (typeof SYMBOLS)[number];
  tf: (typeof TIMEFRAMES)[number];
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/** Returns a clean Prefs object, or null if any field is missing or not allowed. */
export function parsePrefs(raw: unknown): Prefs | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!oneOf(LANGS, r.lang) || !oneOf(THEMES, r.theme) || !oneOf(SYMBOLS, r.symbol) || !oneOf(TIMEFRAMES, r.tf)) {
    return null;
  }
  return { lang: r.lang, theme: r.theme, symbol: r.symbol, tf: r.tf };
}
