"use client";

import { hasPlaceholders, SITE } from "@/config/site";
import { fill, LEGAL } from "@/content/legal";
import { useI18n } from "@/lib/i18n";

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { lang, t } = useI18n();
  const doc = LEGAL[kind][lang];
  return (
    <article className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-2xl font-semibold">{doc.title}</h1>
      <p className="mt-1 text-xs text-slate-500">{t("legal.updated", { date: SITE.legalUpdated })}</p>
      {hasPlaceholders() && (
        <p role="note" className="mt-4 rounded border border-amber-600 bg-amber-900/30 p-3 text-sm">
          {t("legal.draft")}
        </p>
      )}
      <p className="mt-4 text-sm text-slate-300">{fill(doc.intro)}</p>
      {doc.sections.map((s) => (
        <section key={s.heading} className="mt-6">
          <h2 className="text-base font-semibold">{s.heading}</h2>
          {s.body?.map((p) => (
            <p key={p} className="mt-2 text-sm text-slate-300">{fill(p)}</p>
          ))}
          {s.list && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {s.list.map((li) => <li key={li}>{fill(li)}</li>)}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
