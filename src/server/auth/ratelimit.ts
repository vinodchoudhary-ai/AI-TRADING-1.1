/** Sliding-window limiter kept in memory: resets on restart and is per process (the app runs as one). */
export function createLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /** Records an attempt. Returns false when the key is over its limit (the attempt is not counted). */
    take(key: string): boolean {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.length === 0 || t - v[v.length - 1] >= windowMs) hits.delete(k);
      }
      return true;
    },
  };
}

type Limiter = ReturnType<typeof createLimiter>;

/** [max attempts, window in ms] for every named limiter. */
const SPECS = {
  signupIp: [5, 60 * 60_000],
  loginIp: [20, 15 * 60_000],
  loginEmail: [10, 15 * 60_000],
  deleteUser: [5, 15 * 60_000],
  // Public data endpoints: a normal page makes about 6 requests a minute, so this is generous.
  publicApi: [120, 60_000],
  changePassword: [5, 15 * 60_000],
  verifySend: [3, 60 * 60_000],
  resetIp: [10, 60 * 60_000],
  resetEmail: [3, 60 * 60_000],
  tokenConfirm: [20, 15 * 60_000],
} as const satisfies Record<string, readonly [number, number]>;

// Kept on globalThis so counts survive dev hot reloads. Each limiter is created the first time it is asked
// for, so a limiter added later is never missing from an older, already-stored set.
const g = globalThis as unknown as { aurumLimiters?: Partial<Record<keyof typeof SPECS, Limiter>> };
const store = (g.aurumLimiters ??= {});

export const limiters = {} as Record<keyof typeof SPECS, Limiter>;
for (const name of Object.keys(SPECS) as (keyof typeof SPECS)[]) {
  Object.defineProperty(limiters, name, {
    enumerable: true,
    get: () => {
      const [max, windowMs] = SPECS[name];
      return (store[name] ??= createLimiter(max, windowMs));
    },
  });
}
