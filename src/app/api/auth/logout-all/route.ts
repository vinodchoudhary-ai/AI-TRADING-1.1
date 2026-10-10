import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, COOKIE, fail, sameOrigin } from "@/server/auth/http";
import { deleteSessionsFor, getUserByToken } from "@/server/auth/service";

/** Signs the user out on every device, including this one. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  const user = getUserByToken(req.cookies.get(COOKIE)?.value);
  if (!user) return fail("unauthorized");
  deleteSessionsFor(user.id);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, req);
  return res;
}
