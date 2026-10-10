import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, COOKIE, fail, readJson, sameOrigin } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { deleteUser, getUserByToken } from "@/server/auth/service";

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  const user = getUserByToken(req.cookies.get(COOKIE)?.value);
  if (!user) return fail("unauthorized");
  if (!limiters.deleteUser.take(user.id)) return fail("rate_limited");
  const body = await readJson(req);
  if (!body || typeof body.password !== "string") return fail("invalid_request");
  if (!(await deleteUser(user.id, body.password))) return fail("bad_credentials");
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, req);
  return res;
}
