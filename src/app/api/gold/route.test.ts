import { describe, expect, it } from "vitest";

delete process.env.TWELVEDATA_API_KEY; // so the route answers quickly without any upstream call
const { GET } = await import("./route");

const req = (ip: string, qs = "tf=15m") =>
  new Request(`http://localhost/api/gold?${qs}`, { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

describe("GET /api/gold", () => {
  it("answers 503 no-key when no provider key is configured", async () => {
    const res = await GET(req("203.0.113.1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "no-key" });
  });

  it("rejects an unknown timeframe", async () => {
    expect((await GET(req("203.0.113.2", "tf=7m"))).status).toBe(400);
  });

  it("limits one client to 120 requests a minute, with Retry-After, without affecting others", async () => {
    const ip = "203.0.113.50";
    let limited = 0;
    for (let i = 0; i < 130; i++) {
      const res = await GET(req(ip));
      if (res.status === 429) {
        limited++;
        expect(res.headers.get("Retry-After")).toBe("60");
        expect(await res.json()).toEqual({ error: "rate_limited" });
      }
    }
    expect(limited).toBe(10);
    expect((await GET(req("203.0.113.51"))).status).toBe(503); // another client is unaffected (503 = no key, not 429)
  });
});
