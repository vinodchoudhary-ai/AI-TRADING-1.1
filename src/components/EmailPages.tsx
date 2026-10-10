"use client";

import Link from "next/link";
import { useState } from "react";
import { authCall, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { BTN, errorText, INPUT, Shell } from "./AuthPages";

/** The token travels in the link's query string; read it when needed, in the browser only. */
const linkToken = () => new URLSearchParams(window.location.search).get("token") ?? "";

export function Forgot() {
  const { t } = useI18n();
  const { mailEnabled } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorCode(null);
    const r = await authCall("POST", "/api/auth/reset/request", { email });
    if (r.ok) setSent(true); else setErrorCode(String(r.data.error));
    setBusy(false);
  };

  return (
    <Shell title={t("forgot.title")}>
      {mailEnabled === false ? (
        <p className="text-sm text-slate-300">{t("forgot.unavailable")}</p>
      ) : sent ? (
        <p role="status" className="text-sm text-emerald-400">{t("forgot.sent")}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-slate-300">{t("forgot.desc")}</p>
          <label className="block text-sm">
            {t("auth.email")}
            <input type="email" name="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          </label>
          <p role="alert" className="min-h-5 text-sm text-red-400">{errorCode && errorText(t, errorCode)}</p>
          <button type="submit" disabled={busy} className={BTN}>{busy ? t("auth.working") : t("forgot.send")}</button>
        </form>
      )}
      <p className="mt-6"><Link href="/signin" className="text-sm text-amber-400 underline">{t("forgot.back")}</Link></p>
    </Shell>
  );
}

export function Reset() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorCode(null);
    const r = await authCall("POST", "/api/auth/reset/confirm", { token: linkToken(), password });
    if (r.ok) setDone(true); else setErrorCode(String(r.data.error));
    setBusy(false);
  };

  return (
    <Shell title={t("reset.title")}>
      {done ? (
        <>
          <p role="status" className="text-sm text-emerald-400">{t("reset.done")}</p>
          <Link href="/signin" className={`${BTN} mt-4 inline-block`}>{t("auth.signin")}</Link>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block text-sm">
            {t("reset.new")}
            <input type="password" name="password" autoComplete="new-password" required value={password}
              aria-describedby="pw-hint" onChange={(e) => setPassword(e.target.value)} className={INPUT} />
            <span id="pw-hint" className="mt-1 block text-xs text-slate-400">{t("auth.pwHint")}</span>
          </label>
          <p role="alert" className="min-h-5 text-sm text-red-400">{errorCode && errorText(t, errorCode)}</p>
          <button type="submit" disabled={busy} className={BTN}>{busy ? t("auth.working") : t("reset.submit")}</button>
        </form>
      )}
    </Shell>
  );
}

export function Verify() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A button, not an automatic request on page load: mail scanners and link previews open links
  // without a person, and would otherwise use up the single-use token.
  const confirm = async () => {
    setBusy(true);
    setErrorCode(null);
    const r = await authCall("POST", "/api/auth/verify/confirm", { token: linkToken() });
    if (r.ok) setDone(true); else setErrorCode(String(r.data.error));
    setBusy(false);
  };

  return (
    <Shell title={t("verify.title")}>
      {done ? (
        <>
          <p role="status" className="text-sm text-emerald-400">{t("verify.done")}</p>
          <Link href="/account" className={`${BTN} mt-4 inline-block`}>{t("verify.toAccount")}</Link>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-300">{t("verify.desc")}</p>
          <p role="alert" className="mt-3 min-h-5 text-sm text-red-400">{errorCode && errorText(t, errorCode)}</p>
          <button onClick={confirm} disabled={busy} className={`${BTN} mt-2`}>{busy ? t("auth.working") : t("verify.btn")}</button>
        </>
      )}
    </Shell>
  );
}
