import { NextResponse, type NextRequest } from "next/server";
import { parsePrefs } from "@/lib/prefs";
import { mailMode } from "@/server/mail";
import { COOKIE, fail, readJson, sameOrigin } from "@/server/auth/http";
import { getUserByToken, setPrefs } from "@/server/auth/service";

export async function PUT(req: NextRequest) {
  if (!sameOrigin(req)) return fail("bad_origin");
  const user = getUserByToken(req.cookies.get(COOKIE)?.value);
  if (!user) return fail("unauthorized");
  // Only enforced when we can actually send the verification email; otherwise nobody could ever verify.
  if (mailMode() !== "disabled" && !user.emailVerified) return fail("email_unverified");
  const body = await readJson(req);
  const prefs = parsePrefs(body);
  if (!prefs) return fail("invalid_prefs");
  setPrefs(user.id, prefs);
  return NextResponse.json({ prefs });
}
