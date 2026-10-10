"use client";

import { LANG_NAMES, LANGS, useI18n, type Lang } from "@/lib/i18n";
import { THEMES, useTheme, type Theme } from "@/lib/theme";

const Page = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mx-auto w-full max-w-3xl p-4">
    <h1 className="mb-3 text-xl font-semibold">{title}</h1>
    {children}
  </div>
);

export function Settings() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  return (
    <Page title={t("set.title")}>
      <label className="flex items-center gap-3 text-sm">
        {t("set.language")}
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
          {LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
        </select>
      </label>
      <label className="mt-4 flex items-center gap-3 text-sm">
        {t("set.theme")}
        <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
          {THEMES.map((th) => <option key={th} value={th}>{t(`theme.${th}`)}</option>)}
        </select>
      </label>
      <p className="mt-6 text-sm text-slate-400">{t("set.about")}</p>
    </Page>
  );
}

export function Risk() {
  const { t } = useI18n();
  return (
    <Page title={t("risk.title")}>
      <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
        {(["risk.1", "risk.2", "risk.3", "risk.4"] as const).map((k) => <li key={k}>{t(k)}</li>)}
      </ul>
    </Page>
  );
}
