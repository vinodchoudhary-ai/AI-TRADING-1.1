"use client";

import { useEffect, useMemo, useState } from "react";
import { STRATEGIES } from "@/lib/analysis/strategies";
import type { Tier } from "@/lib/analysis/backtest";
import { MIN_SAMPLE, stats, statsByStrategy, type StoredSignal } from "@/lib/history";
import { useI18n } from "@/lib/i18n";

const TIER_STYLE: Record<Tier, string> = {
  proven: "bg-emerald-900 text-emerald-100",
  promising: "bg-amber-900 text-amber-100",
  unproven: "bg-slate-800 text-slate-300",
};

const NAMES: Record<string, string> = Object.fromEntries(STRATEGIES.map((s) => [s.id, s.name]));

export function SignalHistory() {
  const { t } = useI18n();
  const [history, setHistory] = useState<StoredSignal[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/signals").then((r) => r.json())
        .then((d: { signals: StoredSignal[] }) => alive && setHistory(d.signals))
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const name = (id: string) => (id === "legacy" ? t("hist.legacy") : NAMES[id] ?? id);
  const overall = useMemo(() => stats(history), [history]);
  const byStrategy = useMemo(() => statsByStrategy(history), [history]);
  const rows = useMemo(
    () => (filter === "all" ? history : history.filter((h) => h.strategy === filter)),
    [history, filter],
  );

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <h1 className="mb-1 text-xl font-semibold">{t("hist.title")}</h1>
      <p className="text-sm text-slate-400">{t("hist.sub")}</p>
      <p className="mt-2 text-sm text-slate-300">{t("hist.fwdDesc")}</p>

      <p className="mt-4 text-sm">
        {t("hist.wins")} {overall.wins} · {t("hist.losses")} {overall.losses} · {t("hist.open")} {overall.open} ·{" "}
        {overall.winRate === null
          ? t("hist.hidden", { min: MIN_SAMPLE, n: overall.resolved })
          : t("hist.rate", { pct: (overall.winRate * 100).toFixed(0), n: overall.resolved })}
      </p>

      {history.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">{t("hist.empty")}</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("bt.strategy")}</th>
                  <th className="pr-3 font-medium">{t("hist.col.signals")}</th>
                  <th className="pr-3 font-medium">{t("hist.col.resolved")}</th>
                  <th className="pr-3 font-medium">{t("hist.open")}</th>
                  <th className="pr-3 font-medium">{t("bt.win")}</th>
                  <th className="font-medium">{t("bt.exp")}</th>
                </tr>
              </thead>
              <tbody>
                {byStrategy.map(({ strategy, stats: s }) => (
                  <tr key={strategy} className="border-t border-slate-800">
                    <td className="py-1.5 pr-3">{name(strategy)}</td>
                    <td className="pr-3">{s.resolved + s.open}</td>
                    <td className="pr-3">{s.resolved}</td>
                    <td className="pr-3">{s.open}</td>
                    <td className="pr-3">
                      {s.winRate === null ? <span className="text-slate-500">{t("hist.needMore", { min: MIN_SAMPLE })}</span> : `${(s.winRate * 100).toFixed(0)}%`}
                    </td>
                    <td className={s.expectancy !== null && s.expectancy > 0 ? "text-emerald-400" : s.expectancy !== null ? "text-red-400" : ""}>
                      {s.expectancy === null ? "—" : `${s.expectancy.toFixed(2)}R`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="mt-5 flex items-center gap-2 text-sm">
            {t("hist.filter")}
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
              <option value="all">{t("hist.all")}</option>
              {byStrategy.map(({ strategy }) => <option key={strategy} value={strategy}>{name(strategy)}</option>)}
            </select>
          </label>

          <ul className="mt-2 divide-y divide-slate-800 text-sm">
            {[...rows].reverse().slice(0, 100).map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="text-slate-400">{new Date(h.time * 1000).toLocaleString()}</span>
                <span>{h.symbol} {h.tf}</span>
                <span className="text-slate-300">{name(h.strategy)}</span>
                {h.tier && <span className={`rounded px-1.5 py-0.5 text-[11px] ${TIER_STYLE[h.tier]}`} title={t("hist.labelThen")}>{t(`sig.tier.${h.tier}`)}</span>}
                <span className={h.direction === "BUY" ? "text-emerald-400" : "text-red-400"}>{h.direction}</span>
                <span>@ {h.entry.toFixed(2)}</span>
                <span className="ml-auto">
                  {h.outcome.toUpperCase()}
                  {h.r !== undefined && (
                    <span className={h.r > 0 ? " text-emerald-400" : " text-red-400"}> {h.r > 0 ? "+" : ""}{h.r.toFixed(2)}R</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-xs text-slate-500">{t("hist.note")}</p>
    </div>
  );
}
