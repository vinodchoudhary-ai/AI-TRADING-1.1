import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy. A nonce-based policy would force every page to render per request, so this is a
 * static one: only this site, Binance (BTC candles are fetched by the browser) and inline scripts, which
 * Next's own bootstrap and the no-flash theme script need. The app renders no user-supplied HTML.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`, // React uses eval for debugging in development only
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.binance.com${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          // Only in production; browsers ignore it over plain HTTP, and it must not stick to localhost in development.
          ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=15552000" }]),
        ],
      },
      // These links carry a one-time secret in the URL; never pass it on in a Referer header.
      // Listed after the rule above on purpose: when two rules set the same header, the last one wins.
      { source: "/reset", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/verify", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
