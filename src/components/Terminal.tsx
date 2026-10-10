"use client";

import { useEffect, useMemo, useState } from "react";
import { analyze, bestSetup, isActionable, lastClosedIndex } from "@/lib/analysis/analyze";
import { ALL_IDS, DEFAULT_ENABLED, type IndicatorId } from "@/lib/analysis/catalog";
import { buildOverlays, EMPTY } from "@/lib/analysis/overlays";
import { COST_PCT } from "@/lib/costs";
import { loadHistory, loadLatest, mergeCandles, TF_SECONDS, TIMEFRAMES, type Series, type Symbol, type Timeframe } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { SYMBOLS } from "@/lib/prefs";
import { usePersisted, usePersistedList } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import AnalysisPanel from "./chart/AnalysisPanel";
import ChartView from "./chart/ChartView";
import IndicatorPanel from "./chart/IndicatorPanel";

const CHART_COLORS = {
  dark: { bg: "#0b0f17", text: "#9aa4b2", grid: "#161d2b" },
  light: { bg: "#ffffff", text: "#475569", grid: "#e2e8f0" },
} as const;

/** A fetched series, tagged with what it is and when it arrived, so a stale one is never analysed as another market. */
interface Loaded extends Series {
  symbol: Symbol;
  tf: Timeframe;
  at: number;
}

export default function Terminal() {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const [symbol, setSymbol] = usePersisted<Symbol>("aurum-symbol", "XAUUSD", SYMBOLS);
  const [tf, setTf] = usePersisted<Timeframe>("aurum-tf", "15m", TIMEFRAMES);
  const [enabledList, setEnabledList] = usePersistedList<IndicatorId>("aurum-indicators", DEFAULT_ENABLED, ALL_IDS);
  const enabled = useMemo(() => new Set<string>(enabledList), [enabledList]);
  const [panel, setPanel] = usePersisted<"open" | "closed">("aurum-panel", "open", ["open", "closed"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [series, setSeries] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const stamp = () => Math.floor(Date.now() / 1000);
    // Full history once per market and timeframe...
    loadHistory(symbol, tf)
      .then((s) => alive && (setSeries({ ...s, symbol, tf, at: stamp() }), setError(null)))
      .catch((e: Error) => alive && setError(e.message));
    // ...then only the newest few candles every 15 seconds, merged onto it.
    const id = setInterval(() => {
      loadLatest(symbol, tf)
        .then((l) => alive && setSeries((prev) =>
          prev && prev.symbol === symbol && prev.tf === tf
            ? { ...prev, candles: mergeCandles(prev.candles, l.candles), at: stamp() }
            : prev))
        .catch((e: Error) => alive && setError(e.message));
    }, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [symbol, tf]);

  const fresh = series && series.symbol === symbol && series.tf === tf ? series : null;
  const real = fresh && fresh.source === "live" ? fresh : null;

  // Recompute only when a new candle closes, not on every price refresh: the statistics describe closed candles.
  const closed = real ? lastClosedIndex(real.candles, TF_SECONDS[tf], real.at) : -1;
  const analysisKey = real ? `${symbol}|${tf}|${closed}|${real.candles[closed]?.time ?? 0}` : "";
  const analysis = useMemo(
    () => (real ? analyze(real.candles, TF_SECONDS[tf], { nowSec: real.at, costPct: COST_PCT[symbol] }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the closed candle on purpose
    [analysisKey],
  );

  const trailing = analysis && real ? real.candles.slice(analysis.closedIndex + 1) : [];
  const actionable = analysis ? analysis.live.filter((s) => isActionable(s, trailing, analysis.ctx.atr[s.index])) : [];
  const best = bestSetup(actionable);
  // Only a setup with a measured edge is drawn automatically; an unproven one appears only if the user asks for it.
  const selected = actionable.find((s) => s.strategy === selectedId) ?? best ?? null;

  const overlays = useMemo(
    () => (analysis ? buildOverlays(analysis, enabled, selected) : EMPTY),
    [analysis, enabled, selected],
  );

  const flags = {
    hasVolume: real ? real.candles.some((k) => k.volume > 0) : false,
    hasDelta: real ? real.candles.some((k) => k.buyVolume !== undefined) : false,
  };

  const direction = analysis
    ? analysis.confluence.adx < 20
      ? "dir.range"
      : analysis.ctx.structure.trend[analysis.ctx.n - 1] === 1
        ? "dir.up"
        : analysis.ctx.structure.trend[analysis.ctx.n - 1] === -1
          ? "dir.down"
          : "dir.range"
    : null;

  return (
    <div className="flex flex-1 flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-lg font-semibold">{t("nav.chart")}</h1>
        {SYMBOLS.map((s) => (
          <button key={s} onClick={() => setSymbol(s)} aria-pressed={s === symbol}
            className={`rounded px-3 py-1 text-sm ${s === symbol ? "bg-amber-500 text-black" : "bg-slate-800"}`}>
            {s.slice(0, 3)}/{s.slice(3)}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-slate-700" />
        {TIMEFRAMES.map((x) => (
          <button key={x} onClick={() => setTf(x)} aria-pressed={x === tf}
            className={`rounded px-2 py-1 text-xs ${x === tf ? "bg-blue-600 text-white" : "bg-slate-800"}`}>
            {x}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {direction && (
            <span className="rounded bg-slate-800 px-2 py-1 text-xs">{t(direction)}</span>
          )}
          {fresh && (
            <span className={`rounded px-2 py-1 text-xs ${fresh.source === "live" ? "bg-emerald-900" : "bg-amber-900"}`}>
              {fresh.source === "live" ? t("data.live") : t("data.sample")}
            </span>
          )}
        </span>
      </header>
      {error && <p role="alert" className="text-sm text-red-400">{t("data.error")}: {error}</p>}

      <IndicatorPanel
        enabled={enabledList}
        onChange={setEnabledList}
        data={flags}
        open={panel === "open"}
        onToggleOpen={() => setPanel(panel === "open" ? "closed" : "open")}
      />

      <ChartView candles={fresh?.candles ?? []} overlays={overlays} colors={CHART_COLORS[resolved]} />

      {analysis ? (
        <AnalysisPanel
          analysis={analysis}
          actionable={actionable}
          best={best}
          selectedId={selected?.strategy ?? null}
          onSelect={setSelectedId}
          showConfluence={enabled.has("tenInOne")}
        />
      ) : fresh ? (
        <p role="status" className="rounded border border-slate-800 p-3 text-sm text-slate-400">
          {fresh.source === "sample" ? t("sig.sampleOff") : t("sig.needHistory")}
        </p>
      ) : null}
    </div>
  );
}
