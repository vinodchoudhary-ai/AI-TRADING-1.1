"use client";

import { CATALOG, unavailable, type IndicatorId } from "@/lib/analysis/catalog";
import { useI18n } from "@/lib/i18n";

interface Props {
  enabled: IndicatorId[];
  onChange: (next: IndicatorId[]) => void;
  data: { hasVolume: boolean; hasDelta: boolean };
  open: boolean;
  onToggleOpen: () => void;
}

export default function IndicatorPanel({ enabled, onChange, data, open, onToggleOpen }: Props) {
  const { t } = useI18n();
  const toggle = (id: IndicatorId) => onChange(enabled.includes(id) ? enabled.filter((x) => x !== id) : [...enabled, id]);

  return (
    <section aria-label={t("panel.title")} className="rounded border border-slate-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {t("panel.title")} <span className="ml-1 font-normal text-slate-400">{t("panel.enabled", { n: enabled.filter((id) => unavailable(id, data) === null).length })}</span>
        </h2>
        <button onClick={onToggleOpen} aria-expanded={open} className="rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700">
          {open ? t("panel.hide") : t("panel.show")}
        </button>
      </div>
      {open && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {CATALOG.map((cat) => {
              const reasons = cat.items.map((i) => unavailable(i.id, data)).filter((r): r is NonNullable<typeof r> => r !== null);
              const on = cat.items.filter((i) => enabled.includes(i.id) && unavailable(i.id, data) === null).length;
              return (
                <div key={cat.id} className="rounded border border-slate-800 bg-slate-900/40 p-2">
                  <div className="mb-2 flex items-start justify-between gap-2 text-xs">
                    <span className="font-medium">{t(cat.titleKey)}</span>
                    <span className="shrink-0 text-slate-500">{t("panel.enabled", { n: on })}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {cat.items.map((item) => {
                      const na = unavailable(item.id, data);
                      const isOn = enabled.includes(item.id) && na === null;
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggle(item.id)}
                          disabled={na !== null}
                          aria-pressed={isOn}
                          title={na ? t(na) : undefined}
                          className={`rounded px-2 py-1.5 text-left text-xs transition-colors ${
                            na
                              ? "cursor-not-allowed bg-slate-900 text-slate-400 line-through decoration-slate-600"
                              : isOn
                                ? "bg-blue-600 text-white hover:bg-blue-500"
                                : "border border-slate-700 hover:bg-slate-800"
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  {[...new Set(reasons)].map((r) => (
                    <p key={r} className="mt-2 text-[11px] leading-snug text-slate-500">{t(r)}</p>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("panel.hint")}</p>
        </>
      )}
    </section>
  );
}
