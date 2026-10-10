"use client";

import { useEffect, useState } from "react";
import type { Prefs } from "./prefs";

export interface AuthUser {
  id: string;
  email: string;
  prefs: Prefs | null;
  emailVerified: boolean;
}

/** POST/PUT/DELETE JSON to an auth route. Returns the parsed body, or { error } on failure. */
export async function authCall(
  method: "POST" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "generic" } };
  }
}

/** undefined while loading, null when signed out. */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  // Whether this server can send email at all (verification, password reset). Unknown until loaded.
  const [mailEnabled, setMailEnabled] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { user: AuthUser | null; mailEnabled?: boolean }) => {
        if (!alive) return;
        setUser(d.user);
        setMailEnabled(d.mailEnabled === true);
      })
      .catch(() => alive && (setUser(null), setMailEnabled(false)));
    return () => { alive = false; };
  }, []);
  return { user, setUser, mailEnabled };
}
