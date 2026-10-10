export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Trimmed, lower-cased email, or null if it doesn't look like one. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Length rules only (NIST-style): 10 to 128 characters, not just one repeated character, not the email. */
export function isAcceptablePassword(raw: unknown, email?: string): raw is string {
  if (typeof raw !== "string") return false;
  if (raw.length < PASSWORD_MIN || raw.length > PASSWORD_MAX) return false;
  if (new Set(raw).size < 4) return false;
  if (email && raw.toLowerCase() === email) return false;
  return true;
}
