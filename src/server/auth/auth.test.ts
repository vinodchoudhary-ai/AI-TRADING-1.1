import { describe, expect, it } from "vitest";
import { parsePrefs } from "../../lib/prefs";
import { createLimiter } from "./ratelimit";
import { isAcceptablePassword, normalizeEmail } from "./validate";

// In-memory database for the service tests; must be set before the service is imported.
process.env.DATABASE_FILE = ":memory:";
const svc = await import("./service");
const pw = await import("./password");

const PASSWORD = "correct horse battery";

describe("validation", () => {
  it("normalizes emails and rejects junk", () => {
    expect(normalizeEmail("  Ann@Example.COM ")).toBe("ann@example.com");
    for (const bad of ["", "a@b", "no-at.com", "a b@c.de", 42, null, "x".repeat(250) + "@a.bc"]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
  it("enforces password length and variety", () => {
    expect(isAcceptablePassword(PASSWORD)).toBe(true);
    expect(isAcceptablePassword("short")).toBe(false);
    expect(isAcceptablePassword("aaaaaaaaaaaa")).toBe(false);
    expect(isAcceptablePassword("x".repeat(129))).toBe(false);
    expect(isAcceptablePassword("ann@example.com", "ann@example.com")).toBe(false);
    expect(isAcceptablePassword(12345678901)).toBe(false);
  });
  it("accepts only complete, allowed prefs", () => {
    const ok = { lang: "hi", theme: "dark", symbol: "BTCUSD", tf: "1h" };
    expect(parsePrefs(ok)).toEqual(ok);
    expect(parsePrefs({ ...ok, tf: "2w" })).toBeNull(); // not a supported timeframe
    expect(parsePrefs({ ...ok, tf: "3m" })).toEqual({ ...ok, tf: "3m" }); // newly supported ones are accepted
    expect(parsePrefs({ ...ok, lang: "fr" })).toBeNull();
    expect(parsePrefs({ lang: "en" })).toBeNull();
    expect(parsePrefs(null)).toBeNull();
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and frees up after the window", () => {
    let t = 0;
    const l = createLimiter(2, 1000, () => t);
    expect(l.take("k")).toBe(true);
    expect(l.take("k")).toBe(true);
    expect(l.take("k")).toBe(false);
    expect(l.take("other")).toBe(true);
    t = 1001;
    expect(l.take("k")).toBe(true);
  });
});

describe("passwords", () => {
  it("verifies the right password only, with a salted hash", async () => {
    const a = await pw.hashPassword(PASSWORD);
    const b = await pw.hashPassword(PASSWORD);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await pw.verifyPassword(a, PASSWORD)).toBe(true);
    expect(await pw.verifyPassword(a, PASSWORD + "x")).toBe(false);
  });
  it("rejects damaged or hostile hash strings without throwing", async () => {
    expect(await pw.verifyPassword("garbage", PASSWORD)).toBe(false);
    expect(await pw.verifyPassword("scrypt$999999999$8$3$AAAA$AAAA", PASSWORD)).toBe(false);
  });
});

describe("accounts and sessions", () => {
  it("creates a user, refuses a duplicate email, and never stores the plain password", async () => {
    const r = await svc.createUser("ann@example.com", PASSWORD);
    expect(r.ok).toBe(true);
    const dup = await svc.createUser("ann@example.com", PASSWORD);
    expect(dup).toEqual({ ok: false, error: "email_taken" });
    const { db } = await import("../db");
    const row = db().prepare("SELECT password_hash FROM users WHERE email = ?").get("ann@example.com") as {
      password_hash: string;
    };
    expect(row.password_hash).not.toContain(PASSWORD);
  });

  it("authenticates only with the right password; unknown email fails the same way", async () => {
    expect((await svc.authenticate("ann@example.com", PASSWORD))?.email).toBe("ann@example.com");
    expect(await svc.authenticate("ann@example.com", "wrong password!!")).toBeNull();
    expect(await svc.authenticate("nobody@example.com", PASSWORD)).toBeNull();
  });

  it("sessions: token works, only its hash is stored, logout and expiry end it", async () => {
    const user = (await svc.authenticate("ann@example.com", PASSWORD))!;
    const token = svc.createSession(user.id);
    expect(svc.getUserByToken(token)?.id).toBe(user.id);
    expect(svc.getUserByToken("not-a-real-token")).toBeNull();
    expect(svc.getUserByToken(undefined)).toBeNull();

    const { db } = await import("../db");
    const stored = db().prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[];
    expect(stored.some((s) => s.token_hash === token)).toBe(false);

    db().prepare("UPDATE sessions SET expires_at = ?").run(Date.now() - 1);
    expect(svc.getUserByToken(token)).toBeNull(); // expired

    const t2 = svc.createSession(user.id);
    svc.deleteSession(t2);
    expect(svc.getUserByToken(t2)).toBeNull();
  });

  it("saves prefs per user", async () => {
    const user = (await svc.authenticate("ann@example.com", PASSWORD))!;
    expect(user.prefs).toBeNull();
    const prefs = { lang: "hi", theme: "light", symbol: "BTCUSD", tf: "4h" } as const;
    svc.setPrefs(user.id, prefs);
    const token = svc.createSession(user.id);
    expect(svc.getUserByToken(token)?.prefs).toEqual(prefs);
  });

  it("deleting an account needs the password and removes the user and sessions", async () => {
    const user = (await svc.authenticate("ann@example.com", PASSWORD))!;
    const token = svc.createSession(user.id);
    expect(await svc.deleteUser(user.id, "wrong password!!")).toBe(false);
    expect(svc.getUserByToken(token)).not.toBeNull();
    expect(await svc.deleteUser(user.id, PASSWORD)).toBe(true);
    expect(svc.getUserByToken(token)).toBeNull();
    expect(await svc.authenticate("ann@example.com", PASSWORD)).toBeNull();
  });
});
