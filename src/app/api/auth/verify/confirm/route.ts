import { NextResponse, type NextRequest } from "next/server";
import { clientIp, fail, readJson, sameOrigin } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { markEmailVerified } from "@/server/auth/service";
import { consumeEmailToken } from "@/server/auth/tokens";

// No session needed: people often open the email link in a different browser than the one they signed up in.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  if (!limiters.tokenConfirm.take(clientIp(req))) return fail("rate_limited");
  const body = await readJson(req);
  const token = body?.token;
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return fail("invalid_token");

  const userId = consumeEmailToken(token, "verify");
  if (!userId) return fail("invalid_token");
  markEmailVerified(userId);
  return NextResponse.json({ ok: true });
}
