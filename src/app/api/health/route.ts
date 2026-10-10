import { connection, NextResponse } from "next/server";
import { db } from "@/server/db";
import { mailMode } from "@/server/mail";
import { trackerHealth, trackerStatus } from "@/server/status";

/**
 * For load balancers, uptime monitors and the container health check. 200 while the database answers
 * (even if the tracker is "degraded", which is reported but does not take the site down); 503 if it doesn't.
 * Reveals no secrets, user data or configuration values.
 */
export async function GET() {
  await connection(); // always live, never prerendered
  const t = trackerStatus();
  try {
    db().prepare("SELECT 1").get();
  } catch {
    return NextResponse.json({ status: "down", database: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const health = trackerHealth(t);
  return NextResponse.json(
    {
      status: health === "degraded" ? "degraded" : "ok",
      database: true,
      tracker: {
        state: health,
        lastPassMinutesAgo: t?.lastPass ? Math.round((Date.now() - t.lastPass.at) / 60_000) : null,
        targetsOk: t?.lastPass ? `${t.lastPass.ok}/${t.lastPass.total}` : null,
      },
      email: mailMode(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
