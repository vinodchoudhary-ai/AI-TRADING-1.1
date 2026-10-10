import { NextResponse, type NextRequest } from "next/server";
import { clientIp, fail, readJson, sameOrigin, setSessionCookie } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { authenticate, createSession } from "@/server/auth/service";
import { normalizeEmail } from "@/server/auth/validate";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  const body = await readJson(req);
  if (!body) return fail("invalid_request");
  const email = normalizeEmail(body.email);
  const password = body.password;
  // Same answer for a bad email, a missing password and a wrong password.
  if (!email || typeof password !== "string" || password.length > 128) return fail("bad_credentials");
  if (!limiters.loginIp.take(clientIp(req)) || !limiters.loginEmail.take(email)) return fail("rate_limited");

  const user = await authenticate(email, password);
  if (!user) return fail("bad_credentials");

  const res = NextResponse.json({ user });
  setSessionCookie(res, req, createSession(user.id));
  return res;
}
