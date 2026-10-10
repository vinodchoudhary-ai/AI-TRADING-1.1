"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import CommandPalette from "@/components/CommandPalette";
import { useI18n } from "@/lib/i18n";
import { usePersisted } from "@/lib/store";
import { useTheme } from "@/lib/theme";

const ITEMS = [
  { href: "/", key: "nav.chart", d: "M3 17l5-5 4 4 8-9M3 21h18" },
  { href: "/signals", key: "nav.signals", d: "M4 6h16M4 12h16M4 18h10" },
  { href: "/account", key: "nav.account", d: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" },
  { href: "/settings", key: "nav.settings", d: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3" },
  { href: "/risk", key: "nav.risk", d: "M12 3l10 18H2L12 3zM12 10v5M12 18v.5" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", key: "nav.privacy" },
  { href: "/terms", key: "nav.terms" },
  { href: "/risk", key: "nav.risk" },
] as const;

const SEARCH_D = "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5";
const THEME_D = {
  system: "M3 5h18v11H3zM8 20h8M12 16v4",
  light: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  dark: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z",
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { t, lang, setLang } = useI18n();
  const { theme, cycle } = useTheme();
  const [side, setSide] = usePersisted<"open" | "closed">("aurum-sidebar", "open", ["open", "closed"]);
  const [searching, setSearching] = useState(false);
  const open = side === "open";
  // The button offers the OTHER language, labelled in that language; its accessible name must include this text.
  const langText = lang === "en" ? (open ? "हिन्दी" : "हि") : open ? "English" : "EN";
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rowBtn = "flex items-center gap-3 rounded px-2 py-2 text-sm text-slate-300 hover:bg-slate-800/60";

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-slate-200">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-800 p-2 md:flex ${open ? "w-52" : "w-14"}`}
      >
        <div className="mb-3 flex items-center justify-between px-2 py-1">
          {open && <span className="font-semibold text-amber-400">Aurum Desk</span>}
          <button
            onClick={() => setSide(open ? "closed" : "open")}
            aria-label={open ? t("nav.collapse") : t("nav.expand")}
            aria-expanded={open}
            className="rounded p-1 text-slate-400 hover:bg-slate-800"
          >
            <Icon d={open ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
          </button>
        </div>
        {/* expanded: the name comes from the visible text; collapsed (icon only): it needs a label */}
        <button onClick={() => setSearching(true)} aria-label={open ? undefined : t("nav.search")}
          aria-keyshortcuts="Control+K" title="Ctrl+K" className={`${rowBtn} mb-1`}>
          <Icon d={SEARCH_D} />
          {open && (
            <>
              <span>{t("nav.search")}</span>
              <kbd className="ml-auto rounded border border-slate-700 px-1 text-[10px] text-slate-500">Ctrl K</kbd>
            </>
          )}
        </button>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
              title={t(i.key)}
              className={`flex items-center gap-3 rounded px-2 py-2 text-sm ${active(i.href) ? "bg-slate-800 text-amber-400" : "text-slate-300 hover:bg-slate-800/60"}`}>
              <Icon d={i.d} />
              {open && <span>{t(i.key)}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <button onClick={cycle} aria-label={`${t("nav.theme")}: ${t(`theme.${theme}`)}`} title={t("nav.theme")} className={rowBtn}>
            <Icon d={THEME_D[theme]} />
            {open && <span>{t(`theme.${theme}`)}</span>}
          </button>
          <button
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            aria-label={`${t("set.language")}: ${langText}`}
            className="rounded bg-slate-800 px-2 py-2 text-sm hover:bg-slate-700"
          >
            {langText}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        {children}
        <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="underline-offset-2 hover:text-slate-300 hover:underline">
              {t(l.key)}
            </Link>
          ))}
        </footer>
      </main>

      <nav aria-label={t("nav.main")}
        className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-slate-800 bg-[var(--bg)] py-1 md:hidden">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[11px] ${active(i.href) ? "text-amber-400" : "text-slate-400"}`}>
            <Icon d={i.d} />
            {t(i.key)}
          </Link>
        ))}
        <button onClick={() => setSearching(true)}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[11px] text-slate-400">
          <Icon d={SEARCH_D} />
          {t("nav.search")}
        </button>
      </nav>

      {searching && <CommandPalette onClose={() => setSearching(false)} />}
    </div>
  );
}
