import { NextResponse, type NextRequest } from "next/server";
import { SESSION_DAYS } from "./service";

export const COOKIE = "aurum_session";

export type AuthError =
  | "bad_origin" | "rate_limited" | "invalid_email" | "weak_password"
  | "email_taken" | "bad_credentials" | "unauthorized" | "invalid_prefs" | "invalid_request"
  | "email_unverified" | "invalid_token" | "email_unavailable" | "same_password";

const STATUS: Record<AuthError, number> = {
  bad_origin: 403, rate_limited: 429, invalid_email: 400, weak_password: 400, email_taken: 409,
  bad_credentials: 401, unauthorized: 401, invalid_prefs: 400, invalid_request: 400,
  email_unverified: 403, invalid_token: 400, email_unavailable: 503, same_password: 400,
};

/**
 * Base URL for links inside emails. Comes from APP_URL, never from the request: the Host header
 * can be forged, which would let an attacker aim a victim's reset link at their own server.
 * Outside production we fall back to the request's own origin so local testing just works.
 */
export function appBaseUrl(req: NextRequest, env: Record<string, string | undefined> = process.env): string | null {
  const configured = env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return env.NODE_ENV === "production" ? null : req.nextUrl.origin;
}

export const fail = (error: AuthError) => NextResponse.json({ error }, { status: STATUS[error] });

/** CSRF defence for state-changing calls: the Origin header must name this very site. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/** Client IP for rate limiting. Only meaningful behind your own reverse proxy (see DEPLOYMENT.md). */
export function clientIp(req: { headers: Headers }): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

/** Small JSON bodies only; returns null on anything malformed. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length") ?? 0) > 10_000) return null;
  try {
    const body: unknown = await req.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isHttps = (req: NextRequest) =>
  (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";

export function setSessionCookie(res: NextResponse, req: NextRequest, token: string): void {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(res: NextResponse, req: NextRequest): void {
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", secure: isHttps(req), path: "/", maxAge: 0 });
}
