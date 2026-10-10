"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEMES } from "./prefs";
import { usePersisted } from "./store";

export { THEMES };
export type Theme = (typeof THEMES)[number];

const QUERY = "(prefers-color-scheme: dark)";

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}

/** Saved preference plus the concrete theme to render. Also syncs <html data-theme>. */
export function useTheme() {
  const [theme, setTheme] = usePersisted<Theme>("aurum-theme", "system", THEMES);
  const systemDark = useSystemDark();
  const resolved: "light" | "dark" = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  useEffect(() => { document.documentElement.dataset.theme = resolved; }, [resolved]);
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  return { theme, setTheme, resolved, cycle: () => setTheme(next) };
}
