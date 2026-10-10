import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";

const tmp = mkdtempSync(path.join(os.tmpdir(), "aurum-mail-"));
process.env.DATABASE_FILE = ":memory:";
process.env.MAIL_OUTBOX_FILE = path.join(tmp, "outbox.log");
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const svc = await import("./service");
const tokens = await import("./tokens");
const mail = await import("../mail");
const emails = await import("./emails");
const { appBaseUrl } = await import("./http");
const { db } = await import("../db");

const PW = "correct horse battery";
const NEW_PW = "another long passphrase";

async function newUser(email: string) {
  const r = await svc.createUser(email, PW);
  if (!r.ok) throw new Error("setup failed");
  return r.user;
}

describe("email tokens", () => {
  it("works once, for its own purpose only, and is stored hashed", async () => {
    const u = await newUser("t1@example.test");
    const t = tokens.createEmailToken(u.id, "verify");
    const stored = db().prepare("SELECT token_hash FROM email_tokens").all() as { token_hash: string }[];
    expect(stored.some((s) => s.token_hash === t)).toBe(false);

    expect(tokens.consumeEmailToken(t, "reset")).toBeNull(); // a verify link can't reset a password
    expect(tokens.consumeEmailToken(t, "verify")).toBe(u.id); // and wasn't used up by that attempt
    expect(tokens.consumeEmailToken(t, "verify")).toBeNull(); // single use
  });

  it("returns the user the first time and null the second", async () => {
    const u = await newUser("t2@example.test");
    const t = tokens.createEmailToken(u.id, "reset");
    expect(tokens.consumeEmailToken(t, "reset")).toBe(u.id);
    expect(tokens.consumeEmailToken(t, "reset")).toBeNull();
  });

  it("expires: reset after 1 hour, verify after 24 hours", async () => {
    const u = await newUser("t3@example.test");
    const now = 1_000_000;
    const r = tokens.createEmailToken(u.id, "reset", now);
    expect(tokens.consumeEmailToken(r, "reset", now + tokens.TOKEN_TTL_MS.reset + 1)).toBeNull();
    const v = tokens.createEmailToken(u.id, "verify", now);
    expect(tokens.consumeEmailToken(v, "verify", now + tokens.TOKEN_TTL_MS.reset + 1)).toBe(u.id); // still fine at 1h
    const v2 = tokens.createEmailToken(u.id, "verify", now);
    expect(tokens.consumeEmailToken(v2, "verify", now + tokens.TOKEN_TTL_MS.verify + 1)).toBeNull();
  });

  it("a newer link invalidates the older one", async () => {
    const u = await newUser("t4@example.test");
    const first = tokens.createEmailToken(u.id, "reset");
    const second = tokens.createEmailToken(u.id, "reset");
    expect(tokens.consumeEmailToken(first, "reset")).toBeNull();
    expect(tokens.consumeEmailToken(second, "reset")).toBe(u.id);
  });

  it("rejects garbage", () => {
    expect(tokens.consumeEmailToken("nonsense", "reset")).toBeNull();
    expect(tokens.consumeEmailToken("", "verify")).toBeNull();
  });
});

describe("verification and reset", () => {
  it("new accounts are unverified; verifying is idempotent", async () => {
    const u = await newUser("v1@example.test");
    expect(u.emailVerified).toBe(false);
    svc.markEmailVerified(u.id);
    svc.markEmailVerified(u.id);
    const session = svc.createSession(u.id);
    expect(svc.getUserByToken(session)?.emailVerified).toBe(true);
  });

  it("reset changes the password, signs out every session and counts as verifying the email", async () => {
    const u = await newUser("r1@example.test");
    const s1 = svc.createSession(u.id);
    const s2 = svc.createSession(u.id);
    await svc.resetPassword(u.id, NEW_PW);

    expect(svc.getUserByToken(s1)).toBeNull();
    expect(svc.getUserByToken(s2)).toBeNull();
    expect(await svc.authenticate("r1@example.test", PW)).toBeNull();
    const after = await svc.authenticate("r1@example.test", NEW_PW);
    expect(after?.emailVerified).toBe(true);
  });

  it("deleting a user also removes their pending tokens", async () => {
    const u = await newUser("d1@example.test");
    tokens.createEmailToken(u.id, "reset");
    expect(await svc.deleteUser(u.id, PW)).toBe(true);
    const n = db().prepare("SELECT count(*) AS n FROM email_tokens WHERE user_id = ?").get(u.id) as { n: number };
    expect(n.n).toBe(0);
  });

  it("finds users by email without leaking anything else", () => {
    expect(svc.findUserByEmail("r1@example.test")?.email).toBe("r1@example.test");
    expect(svc.findUserByEmail("nobody@example.test")).toBeNull();
  });
});

describe("mail", () => {
  it("picks smtp only when fully configured, and is off in production without it", () => {
    expect(mail.mailMode({ SMTP_URL: "smtp://x", MAIL_FROM: "a@b.c", NODE_ENV: "production" })).toBe("smtp");
    expect(mail.mailMode({ SMTP_URL: "smtp://x", NODE_ENV: "production" })).toBe("disabled"); // no MAIL_FROM
    expect(mail.mailMode({ NODE_ENV: "production" })).toBe("disabled");
    expect(mail.mailMode({ NODE_ENV: "development" })).toBe("dev-log");
  });

  it("in dev, writes the message to the outbox file instead of sending it", async () => {
    const ok = await mail.sendMail({ to: "x@example.test", subject: "Hello", text: "Link: http://localhost/verify?token=abc" });
    expect(ok).toBe(true);
    const log = readFileSync(process.env.MAIL_OUTBOX_FILE as string, "utf8");
    expect(log).toContain("To: x@example.test");
    expect(log).toContain("token=abc");
  });

  it("email bodies contain the link in both languages and no leftover template markers", () => {
    for (const make of [emails.verificationEmail, emails.resetEmail]) {
      const m = make("https://example.test/x?token=T", "Aurum Desk");
      expect(m.text.split("https://example.test/x?token=T")).toHaveLength(3); // English + Hindi
      expect(m.subject + m.text).not.toMatch(/[{}]|undefined/);
      expect(/[ऀ-ॿ]/.test(m.text)).toBe(true);
    }
  });
});

describe("appBaseUrl (links in emails must not trust the Host header)", () => {
  const req = new NextRequest("http://evil.example/api/x", { headers: { host: "evil.example" } });
  it("uses APP_URL, trimmed", () => {
    expect(appBaseUrl(req, { APP_URL: "https://aurum.example/" })).toBe("https://aurum.example");
  });
  it("refuses to guess in production", () => {
    expect(appBaseUrl(req, { NODE_ENV: "production" })).toBeNull();
  });
  it("falls back to the request origin only outside production", () => {
    expect(appBaseUrl(req, { NODE_ENV: "development" })).toBe("http://evil.example");
  });
});
