/**
 * Assumed round-trip trading cost as a fraction of price (spread + slippage), charged in every backtest
 * and in forward tracking. These are assumptions, not any broker's real quote: edit to match yours.
 */
export const COST_PCT: Record<"XAUUSD" | "BTCUSD", number> = { XAUUSD: 0.0001, BTCUSD: 0.0002 };
