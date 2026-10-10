import { beforeEach, describe, expect, it } from "vitest";
import { fetchGold, GoldError, goldUsage, resetGoldState, TTL_MS, type GoldDeps } from "./gold";

process.env.TWELVEDATA_API_KEY = "test-key";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 9, 12, 0, 0);

/** Twelve Data style response: newest first, "YYYY-MM-DD HH:MM:SS" times. */
function body(n: number, stepMs = 900_000, endMs = T0) {
  const values = Array.from({ length: n }, (_, i) => {
    const t = new Date(endMs - i * stepMs).toISOString().replace("T", " ").slice(0, 19);
    const p = 2000 + (n - i) * 0.1;
    return { datetime: t, open: String(p), high: String(p + 1), low: String(p - 1), close: String(p + 0.5), volume: "0" };
  });
  return { values };
}

function harness(opts: { budget?: number; fail?: boolean; payload?: unknown } = {}) {
  const calls: string[] = [];
  const clock = { now: T0 };
  const deps: GoldDeps = {
    now: () => clock.now,
    budget: opts.budget ?? 100,
    fetch: (async (url: string) => {
      calls.push(url);
      if (opts.fail) throw new Error("network down");
      return { json: async () => opts.payload ?? body(300) };
    }) as unknown as typeof fetch,
  };
  return { deps, calls, clock };
}

beforeEach(() => resetGoldState());

describe("fetchGold cache", () => {
  it("reuses a response within its time-to-live and asks again after it", async () => {
    const h = harness();
    const a = await fetchGold("15m", {}, h.deps);
    const b = await fetchGold("15m", {}, h.deps);
    expect(b).toBe(a);
    expect(h.calls).toHaveLength(1);
    h.clock.now += TTL_MS["15m"] + 1;
    await fetchGold("15m", {}, h.deps);
    expect(h.calls).toHaveLength(2);
  });

  it("keeps slow timeframes much longer than fast ones", async () => {
    expect(TTL_MS["1w"]).toBeGreaterThan(TTL_MS["1h"]);
    expect(TTL_MS["1h"]).toBeGreaterThan(TTL_MS["1m"]);
    const h = harness();
    await fetchGold("1w", {}, h.deps);
    h.clock.now += 10 * 60_000;
    await fetchGold("1w", {}, h.deps);
    expect(h.calls).toHaveLength(1);
  });

  it("shares one upstream call between simultaneous requests", async () => {
    const h = harness();
    const results = await Promise.all(Array.from({ length: 6 }, () => fetchGold("1h", {}, h.deps)));
    expect(h.calls).toHaveLength(1);
    expect(new Set(results).size).toBe(1);
  });

  it("different sizes and timeframes are cached separately; `fresh` skips the cache read", async () => {
    const h = harness();
    await fetchGold("15m", {}, h.deps);
    await fetchGold("15m", { size: 500 }, h.deps);
    await fetchGold("1h", {}, h.deps);
    expect(h.calls).toHaveLength(3);
    await fetchGold("15m", { fresh: true }, h.deps);
    expect(h.calls).toHaveLength(4);
  });
});

describe("fetchGold budget and failures", () => {
  it("stops calling the provider once the daily budget is used, serving older data instead", async () => {
    const h = harness({ budget: 2 });
    const first = await fetchGold("15m", {}, h.deps);
    await fetchGold("1h", {}, h.deps);
    h.clock.now += TTL_MS["15m"] + 1; // 15m is stale and wants a refresh, but the budget is spent
    const again = await fetchGold("15m", {}, h.deps);
    expect(again).toBe(first);
    expect(h.calls).toHaveLength(2);
  });

  it("fails with a clear quota error when the budget is spent and nothing is cached", async () => {
    const h = harness({ budget: 1 });
    await fetchGold("15m", {}, h.deps);
    await expect(fetchGold("4h", {}, h.deps)).rejects.toMatchObject({ message: "quota", status: 503 });
  });

  it("the budget resets on the next UTC day", async () => {
    const h = harness({ budget: 1 });
    await fetchGold("15m", {}, h.deps);
    await expect(fetchGold("4h", {}, h.deps)).rejects.toBeInstanceOf(GoldError);
    h.clock.now += DAY;
    await expect(fetchGold("4h", {}, h.deps)).resolves.toBeDefined();
    expect(goldUsage().used).toBe(1);
  });

  it("falls back to older data when the provider fails, and errors only when there is none", async () => {
    const good = harness();
    const first = await fetchGold("15m", {}, good.deps);
    const broken = harness({ fail: true });
    broken.clock.now = good.clock.now + TTL_MS["15m"] + 1;
    expect(await fetchGold("15m", {}, broken.deps)).toBe(first);
    await expect(fetchGold("30m", {}, broken.deps)).rejects.toMatchObject({ status: 502 });
  });

  it("counts failed attempts against the budget (the provider bills them)", async () => {
    const h = harness({ fail: true, budget: 2 });
    await expect(fetchGold("15m", {}, h.deps)).rejects.toBeDefined();
    await expect(fetchGold("1h", {}, h.deps)).rejects.toBeDefined();
    await expect(fetchGold("4h", {}, h.deps)).rejects.toMatchObject({ message: "quota" });
  });

  it("reports provider error messages", async () => {
    const h = harness({ payload: { status: "error", message: "You have run out of API credits" } });
    await expect(fetchGold("15m", {}, h.deps)).rejects.toMatchObject({ message: "You have run out of API credits", status: 502 });
  });

  it("rejects an unknown timeframe before spending anything, and needs an API key", async () => {
    const h = harness();
    await expect(fetchGold("7m", {}, h.deps)).rejects.toMatchObject({ status: 400 });
    expect(h.calls).toHaveLength(0);
    const saved = process.env.TWELVEDATA_API_KEY;
    delete process.env.TWELVEDATA_API_KEY;
    await expect(fetchGold("15m", {}, h.deps)).rejects.toMatchObject({ message: "no-key", status: 503 });
    process.env.TWELVEDATA_API_KEY = saved;
  });
});

describe("fetchGold data", () => {
  it("returns clean candles oldest first, with duplicates removed", async () => {
    const dup = body(50);
    dup.values.push(dup.values[3]); // a repeated row
    const h = harness({ payload: dup });
    const c = await fetchGold("15m", {}, h.deps);
    expect(c).toHaveLength(50);
    for (let i = 1; i < c.length; i++) expect(c[i].time).toBeGreaterThan(c[i - 1].time);
  });

  it("builds 3-minute candles from 1-minute data", async () => {
    const h = harness({ payload: body(90, 60_000) });
    const c = await fetchGold("3m", {}, h.deps);
    expect(h.calls[0]).toContain("interval=1min");
    expect(h.calls[0]).toContain("outputsize=5000"); // 3000 x 3 capped at the provider maximum
    expect(c.length).toBeGreaterThan(20);
    expect(c.length).toBeLessThanOrEqual(30);
    expect(c[1].time - c[0].time).toBe(180);
  });
});
