/** What the background tracker last did, kept in memory so the health endpoint can report it. */
export interface TrackerStatus {
  startedAt: number;
  intervalMin: number;
  /** null until the first pass finishes. */
  lastPass: { at: number; ok: number; total: number; added: number; settled: number } | null;
}

const g = globalThis as unknown as { aurumTracker?: TrackerStatus };

export const trackerStatus = (): TrackerStatus | null => g.aurumTracker ?? null;

export function markTrackerStarted(intervalMin: number, now = Date.now()): void {
  g.aurumTracker = { startedAt: now, intervalMin, lastPass: null };
}

export function markPassDone(pass: { ok: number; total: number; added: number; settled: number }, now = Date.now()): void {
  if (g.aurumTracker) g.aurumTracker.lastPass = { at: now, ...pass };
}

/**
 * ok       – last pass is recent and every target worked
 * degraded – a pass finished but some targets failed, or the last pass is overdue
 * starting – the tracker has started but has not finished its first pass yet
 * off      – the tracker was never started in this process
 */
export type TrackerHealth = "ok" | "degraded" | "starting" | "off";

export function trackerHealth(s: TrackerStatus | null, now = Date.now()): TrackerHealth {
  if (!s) return "off";
  if (!s.lastPass) return now - s.startedAt > 3 * s.intervalMin * 60_000 ? "degraded" : "starting";
  const overdue = now - s.lastPass.at > 3 * s.intervalMin * 60_000; // missed three passes in a row
  return overdue || s.lastPass.ok < s.lastPass.total ? "degraded" : "ok";
}
