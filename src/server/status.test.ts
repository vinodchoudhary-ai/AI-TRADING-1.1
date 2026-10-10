import { describe, expect, it } from "vitest";
import { trackerHealth, type TrackerStatus } from "./status";

const MIN = 60_000;
const status = (over: Partial<TrackerStatus> = {}): TrackerStatus => ({ startedAt: 0, intervalMin: 10, lastPass: null, ...over });

describe("trackerHealth", () => {
  it("is off when the tracker never started", () => {
    expect(trackerHealth(null)).toBe("off");
  });
  it("is starting until the first pass finishes, and degraded if that takes too long", () => {
    expect(trackerHealth(status(), 5 * MIN)).toBe("starting");
    expect(trackerHealth(status(), 31 * MIN)).toBe("degraded");
  });
  it("is ok after a clean, recent pass", () => {
    const s = status({ lastPass: { at: 100 * MIN, ok: 5, total: 5, added: 0, settled: 0 } });
    expect(trackerHealth(s, 105 * MIN)).toBe("ok");
  });
  it("is degraded when some targets failed in the last pass", () => {
    const s = status({ lastPass: { at: 100 * MIN, ok: 3, total: 5, added: 0, settled: 0 } });
    expect(trackerHealth(s, 101 * MIN)).toBe("degraded");
  });
  it("is degraded when passes stop arriving (three intervals missed)", () => {
    const s = status({ lastPass: { at: 100 * MIN, ok: 5, total: 5, added: 0, settled: 0 } });
    expect(trackerHealth(s, 129 * MIN)).toBe("ok");
    expect(trackerHealth(s, 131 * MIN)).toBe("degraded");
  });
});
