import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";

export type TokenPurpose = "verify" | "reset";

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** One live token per user and purpose: asking again invalidates the previous link. Only the hash is stored. */
export function createEmailToken(userId: string, purpose: TokenPurpose, now: number = Date.now()): string {
  const token = randomBytes(32).toString("base64url");
  db().prepare("DELETE FROM email_tokens WHERE expires_at < ? OR (user_id = ? AND purpose = ?)").run(now, userId, purpose);
  db().prepare("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256(token), userId, purpose, now + TOKEN_TTL_MS[purpose]);
  return token;
}

/** Single use: the row is deleted in the same statement that reads it, so two requests can't both win. */
export function consumeEmailToken(token: string, purpose: TokenPurpose, now: number = Date.now()): string | null {
  const row = db()
    .prepare("DELETE FROM email_tokens WHERE token_hash = ? AND purpose = ? RETURNING user_id, expires_at")
    .get(sha256(token), purpose) as { user_id: string; expires_at: number } | undefined;
  return row && row.expires_at >= now ? row.user_id : null;
}
