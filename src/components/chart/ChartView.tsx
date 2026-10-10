"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Overlays, PaneKey } from "@/lib/analysis/overlays";
import type { Candle } from "@/lib/indicators";
import { ZonesPrimitive } from "./ZonesPrimitive";

export interface ChartColors {
  bg: string;
  text: string;
  grid: string;
}

const PANE_PX = 150;

export default function ChartView({ candles, overlays, colors }: { candles: Candle[]; overlays: Overlays; colors: ChartColors }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleS = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const zones = useRef<ZonesPrimitive | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: colors.bg }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      timeScale: { timeVisible: true },
    });
    chart.current = c;
    const s = c.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350", wickUpColor: "#26a69a", wickDownColor: "#ef5350", borderVisible: false,
    });
    candleS.current = s;
    const z = new ZonesPrimitive();
    s.attachPrimitive(z);
    zones.current = z;
    return () => {
      c.remove();
      chart.current = null;
      candleS.current = null;
      zones.current = null;
    };
    // created once; colours are applied by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chart.current?.applyOptions({
      layout: { background: { color: colors.bg }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    });
  }, [colors]);

  useEffect(() => {
    candleS.current?.setData(candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })));
  }, [candles]);

  // Rebuild every overlay whenever the analysis or the toggles change.
  useEffect(() => {
    const c = chart.current;
    const cs = candleS.current;
    if (!c || !cs) return;
    const undo: (() => void)[] = [];
    const paneIndex = (k: PaneKey) => (k === "main" ? 0 : overlays.panes.indexOf(k) + 1);
    const order: PaneKey[] = ["main", ...overlays.panes];

    for (const pane of order) {
      const idx = paneIndex(pane);
      for (const l of overlays.lines.filter((x) => x.pane === pane)) {
        const s = c.addSeries(LineSeries, {
          color: l.color, lineWidth: l.width, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        }, idx);
        s.setData(l.data.map((d) => (d.value === null ? { time: d.time as UTCTimestamp } : { time: d.time as UTCTimestamp, value: d.value })));
        undo.push(() => c.removeSeries(s));
      }
      for (const h of overlays.hists.filter((x) => x.pane === pane)) {
        const s = c.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, idx);
        s.setData(h.data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value, color: d.color })));
        undo.push(() => c.removeSeries(s));
      }
    }

    const markers = createSeriesMarkers(cs, overlays.markers.map((m) => ({ ...m, time: m.time as UTCTimestamp })));
    undo.push(() => markers.detach());

    const lines: IPriceLine[] = overlays.levels.map((l) =>
      cs.createPriceLine({
        price: l.price, color: l.color, lineWidth: 1, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true, title: l.title,
      }),
    );
    undo.push(() => lines.forEach((l) => cs.removePriceLine(l)));

    zones.current?.setZones(overlays.zones);
    undo.push(() => zones.current?.setZones([]));

    try {
      const panes = c.panes();
      panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
    } catch { /* older panes API: leave default sizes */ }

    return () => {
      // On unmount React runs the chart's own cleanup first, so the chart may already be gone here.
      for (const f of undo) {
        try { f(); } catch { /* already disposed with the chart */ }
      }
    };
  }, [overlays]);

  return <div ref={el} style={{ height: 440 + PANE_PX * overlays.panes.length }} className="w-full rounded border border-slate-800" />;
}
