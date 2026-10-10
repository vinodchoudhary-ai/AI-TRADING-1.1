"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEGAL } from "@/content/legal";
import { authCall, useAuth, type AuthUser } from "@/lib/auth";
import { hasKey, useI18n, type Key } from "@/lib/i18n";
import { parsePrefs, SYMBOLS, TIMEFRAMES, type Prefs } from "@/lib/prefs";
import { usePersisted } from "@/lib/store";
import { useTheme } from "@/lib/theme";

export const INPUT = "mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm";
export const BTN = "rounded bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-60";
const BTN2 = "rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-60";

export const Shell = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mx-auto w-full max-w-md p-4">
    <h1 className="mb-4 text-xl font-semibold">{title}</h1>
    {children}
  </div>
);

export function errorText(t: (k: Key) => string, code: unknown): string {
  const key = `auth.err.${String(code)}`;
  return t(hasKey(key) ? key : "auth.err.generic");
}

export function SignIn() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await authCall("POST", mode === "signin" ? "/api/auth/login" : "/api/auth/signup", { email, password });
    if (r.ok) {
      router.push("/account");
      return; // keep the button busy while navigating
    }
    setError(errorText(t, r.data.error));
    setBusy(false);
  };

  if (user) {
    return (
      <Shell title={t("auth.signin")}>
        <p className="text-sm">{t("auth.signedInAs", { email: user.email })}</p>
        <Link href="/account" className="mt-3 inline-block text-sm text-amber-400 underline">{t("nav.account")}</Link>
      </Shell>
    );
  }

  const signup = mode === "signup";
  return (
    <Shell title={signup ? t("auth.signup") : t("auth.signin")}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block text-sm">
          {t("auth.email")}
          <input type="email" name="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm">
          {t("auth.password")}
          <input type="password" name="password" required value={password}
            autoComplete={signup ? "new-password" : "current-password"}
            aria-describedby={signup ? "pw-hint" : undefined}
            onChange={(e) => setPassword(e.target.value)} className={INPUT} />
          {signup && <span id="pw-hint" className="mt-1 block text-xs text-slate-400">{t("auth.pwHint")}</span>}
        </label>
        <p role="alert" className="min-h-5 text-sm text-red-400">{error}</p>
        <button type="submit" disabled={busy} className={BTN}>
          {busy ? t("auth.working") : signup ? t("auth.signup") : t("auth.signin")}
        </button>
      </form>
      <button type="button" onClick={() => { setMode(signup ? "signin" : "signup"); setError(null); }}
        className="mt-4 text-sm text-amber-400 underline">
        {signup ? t("auth.toSignin") : t("auth.toSignup")}
      </button>
      {!signup && (
        <p className="mt-3">
          <Link href="/forgot" className="text-sm text-slate-400 underline">{t("auth.forgot")}</Link>
        </p>
      )}
      {signup && (
        <>
          <p className="mt-4 text-xs text-slate-400">
            {t("auth.agree").split(/(\{terms\}|\{privacy\})/).map((part, i) =>
              part === "{terms}" ? (
                <Link key={i} href="/terms" className="underline">{LEGAL.terms[lang].title}</Link>
              ) : part === "{privacy}" ? (
                <Link key={i} href="/privacy" className="underline">{LEGAL.privacy[lang].title}</Link>
              ) : (
                part
              ),
            )}
          </p>
          <p className="mt-2 text-xs text-slate-500">{t("auth.note")} {t("auth.privacy")}</p>
        </>
      )}
    </Shell>
  );
}

export function Account() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [symbol, setSymbol] = usePersisted<Prefs["symbol"]>("aurum-symbol", "XAUUSD", SYMBOLS);
  const [tf, setTf] = usePersisted<Prefs["tf"]>("aurum-tf", "15m", TIMEFRAMES);
  const { user, setUser, mailEnabled } = useAuth();
  const router = useRouter();
  // Keys and codes, not text, so messages follow the language if it changes (e.g. after "apply").
  const [note, setNote] = useState<Key | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [delPassword, setDelPassword] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  if (user === undefined) return <Shell title={t("nav.account")}><p className="text-sm text-slate-400">{t("auth.loading")}</p></Shell>;
  if (user === null) {
    return (
      <Shell title={t("nav.account")}>
        <p className="text-sm">{t("auth.needSignin")}</p>
        <Link href="/signin" className={`${BTN} mt-4 inline-block`}>{t("auth.signin")}</Link>
      </Shell>
    );
  }

  const succeed = (okKey: Key) => { setNote(okKey); setErrorCode(null); };
  const failWith = (code: unknown) => { setNote(null); setErrorCode(String(code)); };

  const save = async () => {
    setBusy(true);
    const mine = parsePrefs({ lang, theme, symbol, tf });
    const r = await authCall("PUT", "/api/auth/prefs", mine);
    if (r.ok && mine) setUser({ ...(user as AuthUser), prefs: mine });
    if (r.ok) succeed("auth.saved"); else failWith(r.data.error);
    setBusy(false);
  };

  const apply = () => {
    const p = user.prefs;
    if (!p) return;
    setLang(p.lang);
    setTheme(p.theme);
    setSymbol(p.symbol);
    setTf(p.tf);
    succeed("auth.applied");
  };

  const sendVerification = async () => {
    setBusy(true);
    const r = await authCall("POST", "/api/auth/verify/send");
    if (r.ok) succeed("acct.verifySent"); else failWith(r.data.error);
    setBusy(false);
  };

  const signOut = async () => {
    setBusy(true);
    await authCall("POST", "/api/auth/logout");
    setUser(null);
    router.push("/signin");
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await authCall("POST", "/api/auth/password", { currentPassword: curPw, newPassword: newPw });
    if (r.ok) {
      setCurPw("");
      setNewPw("");
      succeed("acct.changed");
    } else {
      // here a 401 means the CURRENT password was wrong, not the email
      failWith(r.data.error === "bad_credentials" ? "wrong_current" : r.data.error);
    }
    setBusy(false);
  };

  const signOutAll = async () => {
    setBusy(true);
    await authCall("POST", "/api/auth/logout-all");
    setUser(null);
    router.push("/signin");
  };

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await authCall("DELETE", "/api/auth/account", { password: delPassword });
    if (r.ok) {
      setUser(null);
      router.push("/signin");
      return;
    }
    failWith(r.data.error);
    setBusy(false);
  };

  return (
    <Shell title={t("nav.account")}>
      <p className="text-sm">{t("auth.signedInAs", { email: user.email })}</p>

      {user.emailVerified ? (
        <p className="mt-2 text-sm text-emerald-400">✓ {t("acct.verified")}</p>
      ) : mailEnabled ? (
        <div className="mt-3 rounded border border-amber-600 bg-amber-900/30 p-3 text-sm">
          <p className="font-medium">{t("acct.unverified")}</p>
          <p className="mt-1">{t("acct.unverifiedDesc")}</p>
          <button onClick={sendVerification} disabled={busy} className={`${BTN2} mt-2`}>{t("acct.sendVerify")}</button>
        </div>
      ) : mailEnabled === false ? (
        <p className="mt-2 text-xs text-slate-400">{t("acct.mailOff")}</p>
      ) : null}

      <section className="mt-6" aria-label={t("auth.settings")}>
        <h2 className="font-semibold">{t("auth.settings")}</h2>
        <p className="mt-1 text-sm text-slate-400">{t("auth.settingsDesc")}</p>
        {!user.prefs && <p className="mt-2 text-sm text-slate-400">{t("auth.noPrefs")}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={save} disabled={busy} className={BTN}>{t("auth.save")}</button>
          <button onClick={apply} disabled={busy || !user.prefs} className={BTN2}>{t("auth.apply")}</button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm text-emerald-400">{note && t(note)}</p>
        <p role="alert" className="min-h-5 text-sm text-red-400">{errorCode && errorText(t, errorCode)}</p>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={signOut} disabled={busy} className={BTN2}>{t("auth.signout")}</button>
        <button onClick={signOutAll} disabled={busy} className={BTN2} title={t("acct.logoutAllDesc")}>{t("acct.logoutAll")}</button>
      </div>
      <p className="mt-1 text-xs text-slate-500">{t("acct.logoutAllDesc")}</p>

      <section className="mt-8 border-t border-slate-800 pt-4" aria-label={t("acct.changeTitle")}>
        <h2 className="font-semibold">{t("acct.changeTitle")}</h2>
        <form onSubmit={changePw} className="mt-3 space-y-3">
          <label className="block text-sm">
            {t("acct.currentPw")}
            <input type="password" autoComplete="current-password" required value={curPw}
              onChange={(e) => setCurPw(e.target.value)} className={INPUT} />
          </label>
          <label className="block text-sm">
            {t("reset.new")}
            <input type="password" autoComplete="new-password" required value={newPw} aria-describedby="chg-hint"
              onChange={(e) => setNewPw(e.target.value)} className={INPUT} />
            <span id="chg-hint" className="mt-1 block text-xs text-slate-400">{t("auth.pwHint")}</span>
          </label>
          <button type="submit" disabled={busy || !curPw || !newPw} className={BTN}>{t("acct.changeBtn")}</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">{t("acct.changeNote")}</p>
      </section>

      <section className="mt-10 border-t border-slate-800 pt-4" aria-label={t("auth.deleteTitle")}>
        <h2 className="font-semibold">{t("auth.deleteTitle")}</h2>
        <p className="mt-1 text-sm text-slate-400">{t("auth.deleteDesc")}</p>
        <form onSubmit={remove} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            {t("auth.password")}
            <input type="password" autoComplete="current-password" required value={delPassword}
              onChange={(e) => setDelPassword(e.target.value)} className={`${INPUT} w-56`} />
          </label>
          <button type="submit" disabled={busy || !delPassword} className="rounded bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-60">
            {t("auth.deleteBtn")}
          </button>
        </form>
      </section>
      <p className="mt-6 text-xs text-slate-500">{t("auth.note")} {t("auth.privacy")}</p>
    </Shell>
  );
}
