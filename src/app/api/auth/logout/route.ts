import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, COOKIE, fail, sameOrigin } from "@/server/auth/http";
import { deleteSession } from "@/server/auth/service";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  deleteSession(req.cookies.get(COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, req);
  return res;
}
