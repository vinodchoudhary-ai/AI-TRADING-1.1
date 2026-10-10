import { NextResponse, type NextRequest } from "next/server";
import { SITE } from "@/config/site";
import { mailMode, sendMail } from "@/server/mail";
import { resetEmail } from "@/server/auth/emails";
import { appBaseUrl, clientIp, fail, readJson, sameOrigin } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { findUserByEmail } from "@/server/auth/service";
import { createEmailToken } from "@/server/auth/tokens";
import { normalizeEmail } from "@/server/auth/validate";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  if (!email) return fail("invalid_email");
  if (!limiters.resetIp.take(clientIp(req)) || !limiters.resetEmail.take(email)) return fail("rate_limited");

  // The answer is identical whether or not the address has an account, so this can't be used to
  // find out who is registered. The email is sent after we've already replied.
  const base = appBaseUrl(req);
  const user = findUserByEmail(email);
  if (user && base && mailMode() !== "disabled") {
    const mail = resetEmail(`${base}/reset?token=${createEmailToken(user.id, "reset")}`, SITE.brand);
    void sendMail({ to: user.email, ...mail });
  }
  return NextResponse.json({ ok: true });
}
