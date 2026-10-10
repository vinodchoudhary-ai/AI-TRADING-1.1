"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const EVT = "aurum-store";
const mem = new Map<string, string>(); // used when localStorage is blocked

/**
 * A saved list of ids (comma-separated in storage), keeping only entries from `allowed`.
 * Falls back to `fallback` when nothing valid is saved. The array identity is stable between renders.
 */
export function usePersistedList<T extends string>(
  key: string, fallback: readonly T[], allowed: readonly T[],
): [T[], (v: T[]) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(EVT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVT, cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const fallbackRaw = fallback.join(",");
  const get = (): string => {
    let v: string | null | undefined;
    try { v = localStorage.getItem(key); } catch { v = mem.get(key); }
    return v ?? fallbackRaw;
  };
  const raw = useSyncExternalStore(subscribe, get, () => fallbackRaw);
  const list = useMemo(
    () => raw.split(",").filter((x): x is T => (allowed as readonly string[]).includes(x)),
    // `allowed` is a constant list; the saved string is what changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw],
  );
  const set = useCallback((v: T[]) => {
    const joined = v.join(",");
    mem.set(key, joined);
    try { localStorage.setItem(key, joined); } catch { /* kept in memory */ }
    window.dispatchEvent(new Event(EVT));
  }, [key]);
  return [list, set];
}

/** localStorage-backed string preference, hydration-safe (server renders the fallback). */
export function usePersisted<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(EVT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVT, cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const get = (): T => {
    let v: string | null | undefined;
    try { v = localStorage.getItem(key); } catch { v = mem.get(key); }
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  };
  const value = useSyncExternalStore(subscribe, get, () => fallback);
  const set = useCallback((v: T) => {
    mem.set(key, v);
    try { localStorage.setItem(key, v); } catch { /* kept in memory */ }
    window.dispatchEvent(new Event(EVT));
  }, [key]);
  return [value, set];
}
