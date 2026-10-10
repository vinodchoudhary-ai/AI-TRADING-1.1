import { NextResponse, type NextRequest } from "next/server";
import { SITE } from "@/config/site";
import { mailMode, sendMail } from "@/server/mail";
import { verificationEmail } from "@/server/auth/emails";
import { appBaseUrl, clientIp, fail, readJson, sameOrigin, setSessionCookie } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { createSession, createUser } from "@/server/auth/service";
import { createEmailToken } from "@/server/auth/tokens";
import { isAcceptablePassword, normalizeEmail } from "@/server/auth/validate";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  if (!limiters.signupIp.take(clientIp(req))) return fail("rate_limited");
  const body = await readJson(req);
  if (!body) return fail("invalid_request");
  const email = normalizeEmail(body.email);
  if (!email) return fail("invalid_email");
  if (!isAcceptablePassword(body.password, email)) return fail("weak_password");

  const created = await createUser(email, body.password);
  if (!created.ok) return fail(created.error);

  // Ask them to confirm the address. Sent after we reply; if email isn't set up, the Account page says so.
  const base = appBaseUrl(req);
  if (base && mailMode() !== "disabled") {
    const mail = verificationEmail(`${base}/verify?token=${createEmailToken(created.user.id, "verify")}`, SITE.brand);
    void sendMail({ to: email, ...mail });
  }

  const res = NextResponse.json({ user: created.user }, { status: 201 });
  setSessionCookie(res, req, createSession(created.user.id));
  return res;
}
