import { NextResponse, type NextRequest } from "next/server";
import { SITE } from "@/config/site";
import { mailMode, sendMail } from "@/server/mail";
import { verificationEmail } from "@/server/auth/emails";
import { appBaseUrl, COOKIE, fail, sameOrigin } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { getUserByToken } from "@/server/auth/service";
import { createEmailToken } from "@/server/auth/tokens";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  const user = getUserByToken(req.cookies.get(COOKIE)?.value);
  if (!user) return fail("unauthorized");
  if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  const base = appBaseUrl(req);
  if (mailMode() === "disabled" || !base) return fail("email_unavailable");
  if (!limiters.verifySend.take(user.id)) return fail("rate_limited");

  const link = `${base}/verify?token=${createEmailToken(user.id, "verify")}`;
  const mail = verificationEmail(link, SITE.brand);
  if (!(await sendMail({ to: user.email, ...mail }))) return fail("email_unavailable");
  return NextResponse.json({ ok: true });
}
