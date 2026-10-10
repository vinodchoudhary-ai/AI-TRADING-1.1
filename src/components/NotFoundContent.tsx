"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export function NotFoundContent() {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-md p-6 text-center">
      <p className="text-5xl font-bold text-amber-400">404</p>
      <h1 className="mt-3 text-xl font-semibold">{t("nf.title")}</h1>
      <p className="mt-2 text-sm text-slate-400">{t("nf.body")}</p>
      <Link href="/" className="mt-5 inline-block rounded bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400">
        {t("nf.home")}
      </Link>
    </div>
  );
}
