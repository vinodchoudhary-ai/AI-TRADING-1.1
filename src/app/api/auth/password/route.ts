import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, fail, readJson, sameOrigin } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { changePassword, getUserByToken } from "@/server/auth/service";
import { isAcceptablePassword } from "@/server/auth/validate";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  const token = req.cookies.get(COOKIE)?.value;
  const user = getUserByToken(token);
  if (!user || !token) return fail("unauthorized");
  if (!limiters.changePassword.take(user.id)) return fail("rate_limited");

  const body = await readJson(req);
  const current = body?.currentPassword;
  const next = body?.newPassword;
  if (typeof current !== "string" || current.length > 128) return fail("invalid_request");
  if (!isAcceptablePassword(next, user.email)) return fail("weak_password");
  if (next === current) return fail("same_password");

  if ((await changePassword(user.id, current, next, token)) === "wrong_password") return fail("bad_credentials");
  return NextResponse.json({ ok: true });
}
