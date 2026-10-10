"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "@/lib/commands";
import { TIMEFRAMES } from "@/lib/data";
import { LANG_NAMES, LANGS, useI18n } from "@/lib/i18n";
import { SYMBOLS } from "@/lib/prefs";
import { usePersisted } from "@/lib/store";
import { THEMES, useTheme } from "@/lib/theme";

/** Mounted only while open, so query and selection reset on every open. */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { setTheme } = useTheme();
  const router = useRouter();
  const [, setSymbol] = usePersisted<(typeof SYMBOLS)[number]>("aurum-symbol", "XAUUSD", SYMBOLS);
  const [, setTf] = usePersisted<(typeof TIMEFRAMES)[number]>("aurum-tf", "15m", TIMEFRAMES);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const list: Command[] = [
      { id: "p-chart", group: t("cmd.pages"), label: t("nav.chart"), keywords: "chart price candles home", run: go("/") },
      { id: "p-signals", group: t("cmd.pages"), label: t("nav.signals"), keywords: "signals history wins losses", run: go("/signals") },
      { id: "p-account", group: t("cmd.pages"), label: t("nav.account"), keywords: "account sign in login sign up register profile", run: go("/account") },
      { id: "p-settings", group: t("cmd.pages"), label: t("nav.settings"), keywords: "settings preferences", run: go("/settings") },
      { id: "p-privacy", group: t("cmd.pages"), label: t("nav.privacy"), keywords: "privacy policy data personal", run: go("/privacy") },
      { id: "p-terms", group: t("cmd.pages"), label: t("nav.terms"), keywords: "terms of use conditions legal", run: go("/terms") },
      { id: "p-risk", group: t("cmd.pages"), label: t("nav.risk"), keywords: "risk disclosure disclaimer", run: go("/risk") },
    ];
    for (const s of SYMBOLS) {
      const name = `${s.slice(0, 3)}/${s.slice(3)}`;
      list.push({
        id: `s-${s}`, group: t("cmd.instruments"), label: t("cmd.show", { name }),
        keywords: `${name} ${s} ${s === "XAUUSD" ? "gold xau" : "bitcoin btc crypto"}`,
        run: () => { setSymbol(s); router.push("/"); },
      });
    }
    for (const tf of TIMEFRAMES) {
      list.push({
        id: `t-${tf}`, group: t("cmd.timeframes"), label: t("cmd.timeframe", { tf }),
        keywords: `timeframe interval ${tf}`, run: () => { setTf(tf); router.push("/"); },
      });
    }
    for (const th of THEMES) {
      list.push({
        id: `th-${th}`, group: t("cmd.appearance"), label: t("cmd.theme", { name: t(`theme.${th}`) }),
        keywords: `theme appearance ${th} ${th === "system" ? "auto" : ""}`, run: () => setTheme(th),
      });
    }
    for (const l of LANGS.filter((x) => x !== lang)) {
      list.push({
        id: `l-${l}`, group: t("cmd.language"), label: t("cmd.lang", { name: LANG_NAMES[l] }),
        keywords: `language ${l === "hi" ? "hindi" : "english"}`, run: () => setLang(l),
      });
    }
    return list;
  }, [t, lang, router, setSymbol, setTf, setTheme, setLang]);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const active = Math.min(index, Math.max(results.length - 1, 0));

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setIndex((active + 1) % Math.max(results.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((active - 1 + results.length) % Math.max(results.length, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(results[active]); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t("nav.search")} onKeyDown={onKeyDown}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-700 bg-[var(--bg)] shadow-xl">
        <input
          ref={input}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          aria-label={t("nav.search")}
          placeholder={t("cmd.placeholder")}
          className="w-full border-b border-slate-800 bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul id="cmd-list" role="listbox" className="max-h-72 overflow-auto py-1">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">{t("cmd.empty")}</li>}
          {results.map((c, i) => (
            <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === active}
              onMouseEnter={() => setIndex(i)} onClick={() => run(c)}
              className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${i === active ? "bg-slate-800" : ""}`}>
              <span>{c.label}</span>
              <span className="text-xs text-slate-400">{c.group}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">{t("cmd.hint")}</p>
      </div>
    </div>
  );
}
