/** The chart's indicator toggles, grouped like the reference screen. Names stay in English (standard trading terms). */
export type IndicatorId =
  | "scalp" | "smc" | "volzones"
  | "volprofile" | "autofib" | "srzones"
  | "ema" | "trendlines" | "direction"
  | "structure" | "fvg" | "orderblock" | "candles"
  | "macdrsi" | "volume" | "boll" | "tenInOne"
  | "liquidity" | "delta" | "footprint" | "bookmap" | "heatmap";

export interface IndicatorDef {
  id: IndicatorId;
  label: string;
}

export interface Category {
  id: string;
  /** Key into the i18n dictionary. */
  titleKey: "cat.signals" | "cat.sr" | "cat.trend" | "cat.structure" | "cat.momentum" | "cat.flow";
  items: IndicatorDef[];
}

export const CATALOG: Category[] = [
  { id: "signals", titleKey: "cat.signals", items: [
    { id: "scalp", label: "Scalping" },
    { id: "smc", label: "Smart Money" },
    { id: "volzones", label: "Volatility Zones" },
  ] },
  { id: "sr", titleKey: "cat.sr", items: [
    { id: "volprofile", label: "Volume Profile S/R" },
    { id: "autofib", label: "Auto Fib" },
    { id: "srzones", label: "S/R Zones" },
  ] },
  { id: "trend", titleKey: "cat.trend", items: [
    { id: "ema", label: "EMA 9/21/50/200" },
    { id: "trendlines", label: "Trend Line + Pattern" },
    { id: "direction", label: "Market Direction" },
  ] },
  { id: "structure", titleKey: "cat.structure", items: [
    { id: "structure", label: "Structure" },
    { id: "fvg", label: "FVG" },
    { id: "orderblock", label: "Order Block" },
    { id: "candles", label: "Candle Analysis" },
  ] },
  { id: "momentum", titleKey: "cat.momentum", items: [
    { id: "macdrsi", label: "MACD + RSI" },
    { id: "volume", label: "Trading Volume" },
    { id: "boll", label: "BOLL" },
    { id: "tenInOne", label: "10 Indicators in One" },
  ] },
  { id: "flow", titleKey: "cat.flow", items: [
    { id: "liquidity", label: "Liquidity Levels" },
    { id: "delta", label: "Volume Delta" },
    { id: "footprint", label: "Footprint" },
    { id: "bookmap", label: "Bookmap" },
    { id: "heatmap", label: "Liquidity Heatmap" },
  ] },
];

export const ALL_IDS: IndicatorId[] = CATALOG.flatMap((c) => c.items.map((i) => i.id));
export const DEFAULT_ENABLED: IndicatorId[] = ["ema", "orderblock", "fvg", "tenInOne"];

/** Why a toggle can't be used right now (i18n key), or null if it can. */
export type UnavailableKey = "na.feed" | "na.volume" | "na.delta";

export function unavailable(id: IndicatorId, data: { hasVolume: boolean; hasDelta: boolean }): UnavailableKey | null {
  if (id === "footprint" || id === "bookmap" || id === "heatmap") return "na.feed"; // needs tick / order-book data
  if (id === "volume" && !data.hasVolume) return "na.volume";
  if (id === "delta" && !data.hasDelta) return "na.delta";
  return null;
}
