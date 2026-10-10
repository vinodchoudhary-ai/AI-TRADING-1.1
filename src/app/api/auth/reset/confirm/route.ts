import { NextResponse, type NextRequest } from "next/server";
import { clientIp, fail, readJson, sameOrigin } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { resetPassword } from "@/server/auth/service";
import { consumeEmailToken } from "@/server/auth/tokens";
import { isAcceptablePassword } from "@/server/auth/validate";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  if (!limiters.tokenConfirm.take(clientIp(req))) return fail("rate_limited");
  const body = await readJson(req);
  const token = body?.token;
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return fail("invalid_token");
  // Check the new password first, so a too-short one doesn't burn the single-use link.
  if (!isAcceptablePassword(body?.password)) return fail("weak_password");

  const userId = consumeEmailToken(token, "reset");
  if (!userId) return fail("invalid_token");
  await resetPassword(userId, body.password as string);
  return NextResponse.json({ ok: true });
}
