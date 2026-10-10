import { NextResponse } from "next/server";
import { clientIp } from "@/server/auth/http";
import { limiters } from "@/server/auth/ratelimit";
import { fetchGold, GoldError } from "@/server/gold";

export async function GET(req: Request) {
  if (!limiters.publicApi.take(clientIp(req))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const params = new URL(req.url).searchParams;
  const tf = params.get("tf") ?? "";
  // ?tail=N returns only the newest N candles (the page's 15-second refresh), from the same cached upstream call.
  const tail = Number(params.get("tail") ?? 0);
  try {
    const candles = await fetchGold(tf);
    return NextResponse.json({ candles: Number.isInteger(tail) && tail > 0 && tail <= 100 ? candles.slice(-tail) : candles });
  } catch (e) {
    const err = e instanceof GoldError ? e : new GoldError("provider-error", 502);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
