"use client";

import { useState } from "react";
import type { Analysis, LiveSetup } from "@/lib/analysis/analyze";
import type { Tier } from "@/lib/analysis/backtest";
import type { Confluence } from "@/lib/analysis/confluence";
import { useI18n } from "@/lib/i18n";

const TIER_STYLE: Record<Tier, string> = {
  proven: "bg-emerald-900 text-emerald-100",
  promising: "bg-amber-900 text-amber-100",
  unproven: "bg-slate-800 text-slate-300",
};

const fmt = (n: number) => n.toFixed(2);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export function ConfluenceCard({ conf }: { conf: Confluence }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const label = conf.score > 0 ? t("conf.bullish") : conf.score < 0 ? t("conf.bearish") : t("conf.neutral");
  const color = conf.score > 0 ? "text-emerald-400" : conf.score < 0 ? "text-red-400" : "text-slate-300";
  return (
    <section aria-label={t("conf.title")} className="rounded border border-slate-800 p-3 text-sm">
      <h3 className="text-xs font-semibold text-slate-400">{t("conf.title")}</h3>
      <div className="mt-1 flex items-baseline justify-between">
        <span className={`text-lg font-bold capitalize ${color}`}>{label}</span>
        <span className={`text-2xl font-bold ${color}`}>{conf.score > 0 ? "+" : ""}{conf.score}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {conf.bullish} {t("conf.bullish")} · {conf.bearish} {t("conf.bearish")} · {conf.neutral} {t("conf.neutral")}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {t("conf.strength")}: ADX {Number.isFinite(conf.adx) ? conf.adx.toFixed(1) : "—"} · {t(`conf.${conf.strength}`)}
      </p>
      <button onClick={() => setAll(!all)} aria-expanded={all} className="mt-2 w-full rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">
        {all ? t("conf.hide") : t("conf.viewAll")}
      </button>
      {all && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {conf.votes.map((v) => (
            <li key={v.name} className="flex justify-between">
              <span>{v.name}</span>
              <span className={v.vote === 1 ? "text-emerald-400" : v.vote === -1 ? "text-red-400" : "text-slate-500"}>
                {v.vote === 1 ? t("conf.bullish") : v.vote === -1 ? t("conf.bearish") : t("conf.neutral")}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] leading-snug text-slate-500">{t("conf.disclaimer")}</p>
    </section>
  );
}

function measured(s: LiveSetup, t: ReturnType<typeof useI18n>["t"]) {
  const a = s.result.all;
  return t("sig.measured", { n: a.n, wr: (a.winRate * 100).toFixed(0), rr: a.avgPlannedRR.toFixed(1), ex: a.expectancy.toFixed(2) });
}

function SetupRow({ s, selected, onSelect }: { s: LiveSetup; selected: boolean; onSelect: () => void }) {
  const { t } = useI18n();
  return (
    <li className="rounded border border-slate-800 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`font-bold ${s.dir === 1 ? "text-emerald-400" : "text-red-400"}`}>{s.dir === 1 ? "BUY" : "SELL"}</span>
        <span className="font-medium">{s.name}</span>
        <span className={`rounded px-2 py-0.5 text-[11px] ${TIER_STYLE[s.tier]}`}>{t(`sig.tier.${s.tier}`)}</span>
        <button onClick={onSelect} aria-pressed={selected} className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700">
          {selected ? t("sig.showing") : t("sig.show")}
        </button>
      </div>
      <p className="mt-1 text-xs">
        {t("signal.entry")} {fmt(s.entry)} · {t("signal.sl")} {fmt(s.sl)} · {t("signal.tp")} {fmt(s.tp)} · {t("sig.rr")} 1:{s.rr.toFixed(1)}
      </p>
      <p className="mt-1 text-xs text-slate-400">{s.reasons.join(" · ")}</p>
      <p className="mt-1 text-xs text-slate-500">{measured(s, t)}</p>
    </li>
  );
}

interface Props {
  analysis: Analysis;
  /** Setups still actionable right now, strongest evidence first. */
  actionable: LiveSetup[];
  best: LiveSetup | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  showConfluence: boolean;
}

export default function AnalysisPanel({ analysis, actionable, best, selectedId, onSelect, showConfluence }: Props) {
  const { t } = useI18n();
  const closedCount = analysis.ctx.n;

  return (
    <section aria-label={t("sig.title")} className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">{t("sig.title")}</h2>
          {best ? (
            <div>
              <p className="mb-1 text-xs text-slate-400">{t("sig.best")}</p>
              <ul><SetupRow s={best} selected={selectedId === best.strategy} onSelect={() => onSelect(best.strategy)} /></ul>
            </div>
          ) : (
            <div role="status" className="rounded border border-slate-700 p-3 text-sm">
              <p className="font-bold">{t("sig.wait")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("sig.waitSub")}</p>
            </div>
          )}
          {actionable.filter((s) => s !== best).length > 0 && (
            <div>
              <p className="mb-1 text-xs text-slate-400">{t("sig.setups")}</p>
              <ul className="space-y-2">
                {actionable.filter((s) => s !== best).map((s) => (
                  <SetupRow key={s.strategy} s={s} selected={selectedId === s.strategy} onSelect={() => onSelect(s.strategy)} />
                ))}
              </ul>
            </div>
          )}
          {actionable.length === 0 && <p className="text-xs text-slate-500">{t("sig.none")}</p>}
        </div>
        {showConfluence && <ConfluenceCard conf={analysis.confluence} />}
      </div>

      <section aria-label={t("bt.title")} className="rounded border border-slate-800 p-3">
        <h3 className="text-sm font-semibold">{t("bt.title")}</h3>
        <p className="mt-1 text-xs text-slate-400">{t("bt.sub", { n: closedCount })}</p>
        {/* focusable so keyboard users can scroll the wide table */}
        <div className="mt-2 overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="text-slate-400">
              <tr>
                <th className="py-1 pr-3 font-medium">{t("bt.strategy")}</th>
                <th className="pr-3 font-medium">{t("bt.trades")}</th>
                <th className="pr-3 font-medium">{t("bt.win")}</th>
                <th className="pr-3 font-medium">{t("bt.rr")}</th>
                <th className="pr-3 font-medium">{t("bt.exp")}</th>
                <th className="pr-3 font-medium">{t("bt.pf")}</th>
                <th className="pr-3 font-medium">{t("bt.dd")}</th>
                <th className="pr-3 font-medium">{t("bt.recent")}</th>
                <th className="font-medium">{t("bt.verdict")}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.results.map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="py-1.5 pr-3">{r.name}</td>
                  <td className="pr-3">{r.all.n}</td>
                  <td className="pr-3">{r.all.n ? pct(r.all.winRate) : "—"}</td>
                  <td className="pr-3">{r.all.n ? `1:${r.all.avgPlannedRR.toFixed(1)}` : "—"}</td>
                  <td className={`pr-3 ${r.all.expectancy > 0 ? "text-emerald-400" : r.all.n ? "text-red-400" : ""}`}>{r.all.n ? `${r.all.expectancy.toFixed(2)}R` : "—"}</td>
                  <td className="pr-3">{r.all.n ? r.all.profitFactor.toFixed(2) : "—"}</td>
                  <td className="pr-3">{r.all.n ? `${r.all.maxDrawdownR.toFixed(1)}R` : "—"}</td>
                  <td className="pr-3">{r.test.n ? `${r.test.n} · ${pct(r.test.winRate)} · ${r.test.expectancy.toFixed(2)}R` : "—"}</td>
                  <td><span className={`rounded px-2 py-0.5 text-[11px] ${TIER_STYLE[r.tier]}`}>{t(`sig.tier.${r.tier}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">{t("bt.note")}</p>
      </section>

      <p className="text-xs text-slate-500">{t("sig.disclaimer")}</p>
    </section>
  );
}
