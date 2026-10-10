import { createHash, randomBytes, randomUUID } from "node:crypto";
import { parsePrefs, type Prefs } from "../../lib/prefs";
import { db } from "../db";
import { fakeVerify, hashPassword, verifyPassword } from "./password";

export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  email: string;
  prefs: Prefs | null;
  emailVerified: boolean;
}

type UserRow = {
  id: string; email: string; password_hash: string; prefs: string | null; email_verified_at: number | null;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function toPublic(r: UserRow): PublicUser {
  let prefs: Prefs | null = null;
  try { prefs = r.prefs ? parsePrefs(JSON.parse(r.prefs)) : null; } catch { /* damaged row: treat as unset */ }
  return { id: r.id, email: r.email, prefs, emailVerified: r.email_verified_at != null };
}

export async function createUser(
  email: string,
  password: string,
): Promise<{ ok: true; user: PublicUser } | { ok: false; error: "email_taken" }> {
  const id = randomUUID();
  const hash = await hashPassword(password);
  try {
    db().prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(id, email, hash, Date.now());
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) return { ok: false, error: "email_taken" };
    throw e;
  }
  return { ok: true, user: { id, email, prefs: null, emailVerified: false } };
}

export function findUserByEmail(email: string): { id: string; email: string } | null {
  const row = db().prepare("SELECT id, email FROM users WHERE email = ?").get(email) as
    | { id: string; email: string }
    | undefined;
  return row ?? null;
}

export function markEmailVerified(userId: string): void {
  db().prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?")
    .run(Date.now(), userId);
}

/**
 * Sets a new password after a successful reset-link use. Signs the user out everywhere (anyone who
 * had the old password or a stolen session loses access) and counts as proof of owning the email.
 */
export async function resetPassword(userId: string, newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword);
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  markEmailVerified(userId);
}

/** Signs a user out everywhere, or everywhere except the session identified by `keepToken`. */
export function deleteSessionsFor(userId: string, keepToken?: string): number {
  const res = keepToken
    ? db().prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(userId, sha256(keepToken))
    : db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return Number(res.changes);
}

/**
 * Changes the password for a signed-in user who proves they know the current one. Every OTHER session is
 * signed out (anything that held the old password or a stolen session loses access) but `keepToken`,
 * the browser making the change, stays signed in.
 */
export async function changePassword(
  userId: string, current: string, next: string, keepToken: string,
): Promise<"ok" | "wrong_password"> {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as UserRow | undefined;
  if (!row || !(await verifyPassword(row.password_hash, current))) return "wrong_password";
  const hash = await hashPassword(next);
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
  deleteSessionsFor(userId, keepToken);
  return "ok";
}

export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const row = db().prepare("SELECT * FROM users WHERE email = ?").get(email) as unknown as UserRow | undefined;
  if (!row) {
    await fakeVerify(password);
    return null;
  }
  return (await verifyPassword(row.password_hash, password)) ? toPublic(row) : null;
}

/** Creates a session and returns the raw token (only its hash is stored). */
export function createSession(userId: string): string {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), userId, now + SESSION_MS);
  return token;
}

export function getUserByToken(token: string | undefined): PublicUser | null {
  if (!token) return null;
  const row = db().prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).get(sha256(token), Date.now()) as unknown as UserRow | undefined;
  return row ? toPublic(row) : null;
}

export function deleteSession(token: string | undefined): void {
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

export function setPrefs(userId: string, prefs: Prefs): void {
  db().prepare("UPDATE users SET prefs = ? WHERE id = ?").run(JSON.stringify(prefs), userId);
}

/** Verifies the password again, then removes the user and every session. */
export async function deleteUser(userId: string, password: string): Promise<boolean> {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as UserRow | undefined;
  if (!row || !(await verifyPassword(row.password_hash, password))) return false;
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db().prepare("DELETE FROM users WHERE id = ?").run(userId);
  return true;
}
