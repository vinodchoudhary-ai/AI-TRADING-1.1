import { describe, expect, it } from "vitest";

// Simulate a dev server that hot-reloaded: an OLDER module already stored a set of limiters that lacks the
// ones added since. Every named limiter must still work.
(globalThis as unknown as { aurumLimiters: object }).aurumLimiters = {
  signupIp: { take: () => true, marker: "kept from the old module" },
};
const { limiters } = await import("./ratelimit");

describe("limiters survive an older stored set", () => {
  it("keeps what was already stored", () => {
    expect((limiters.signupIp as unknown as { marker: string }).marker).toBe("kept from the old module");
  });

  it("creates any that are missing when first asked for, and each one counts independently", () => {
    expect(limiters.publicApi.take("a")).toBe(true);
    expect(limiters.changePassword.take("a")).toBe(true);
    for (let i = 0; i < 4; i++) limiters.changePassword.take("a");
    expect(limiters.changePassword.take("a")).toBe(false); // limit is 5 per window
    expect(limiters.publicApi.take("a")).toBe(true); // a different limiter is not affected
  });

  it("returns the same limiter every time (counts must persist between requests)", () => {
    expect(limiters.resetEmail).toBe(limiters.resetEmail);
  });
});
