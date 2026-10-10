import { connection, NextResponse } from "next/server";
import { clientIp } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { listSignals } from "@/server/db";

export async function GET(req: Request) {
  await connection(); // opt out of prerendering: always read the live database
  if (!limiters.publicApi.take(clientIp(req))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  return NextResponse.json({ signals: listSignals().slice(-500) });
}
