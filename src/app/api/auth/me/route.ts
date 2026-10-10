import { connection, NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/server/auth/http";
import { getUserByToken } from "@/server/auth/service";
import { mailMode } from "@/server/mail";

export async function GET(req: NextRequest) {
  await connection(); // per-request: depends on the session cookie, never prerender or cache
  const res = NextResponse.json({
    user: getUserByToken(req.cookies.get(COOKIE)?.value),
    mailEnabled: mailMode() !== "disabled", // lets the pages say honestly whether email features work here
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
