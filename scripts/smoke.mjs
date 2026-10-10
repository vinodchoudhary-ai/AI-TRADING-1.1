#!/usr/bin/env node
// Smoke test for a running Aurum Desk. Usage:
//   node scripts/smoke.mjs [baseUrl]            (default http://localhost:3000, or $SMOKE_URL)
//   SMOKE_AUTH=1 node scripts/smoke.mjs [url]   also signs up, changes password, signs out and deletes a throwaway account
// Without SMOKE_AUTH nothing is created or changed on the server. Exit code 1 if any check fails.

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const withAuth = process.env.SMOKE_AUTH === "1";
const origin = new URL(base).origin;

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${e instanceof Error ? e.message : e}`);
  }
}
const eq = (actual, expected, what = "value") => {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const has = (text, needle, what = "body") => {
  if (!text.includes(needle)) throw new Error(`${what} does not contain ${JSON.stringify(needle)}`);
};
const get = (path, init) => fetch(base + path, { redirect: "manual", ...init });
const post = (path, body, headers = {}, method = "POST") =>
  fetch(base + path, { method, redirect: "manual", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

console.log(`Smoke test: ${base}${withAuth ? " (with account flow)" : ""}\n`);

console.log("Pages");
const pages = [
  ["/", "Aurum Desk"], ["/signals", "Aurum Desk"], ["/settings", "Aurum Desk"], ["/risk", "Aurum Desk"],
  ["/privacy", "Aurum Desk"], ["/terms", "Aurum Desk"], ["/signin", "Aurum Desk"], ["/account", "Aurum Desk"],
  ["/forgot", "Aurum Desk"], ["/reset", "Aurum Desk"], ["/verify", "Aurum Desk"],
];
for (const [path, text] of pages) {
  await check(`GET ${path} -> 200`, async () => {
    const res = await get(path);
    eq(res.status, 200, "status");
    has(await res.text(), text);
  });
}
await check("unknown page -> 404 with the not-found page", async () => {
  const res = await get("/definitely-not-a-page");
  eq(res.status, 404, "status");
  has(await res.text(), "Page not found");
});

console.log("\nSite files");
await check("robots.txt blocks API and account pages", async () => {
  const res = await get("/robots.txt");
  eq(res.status, 200, "status");
  const t = await res.text();
  has(t, "Disallow: /api/");
  has(t, "Disallow: /account");
});
await check("sitemap.xml is served", async () => eq((await get("/sitemap.xml")).status, 200, "status"));
await check("manifest is valid JSON with a name", async () => {
  const res = await get("/manifest.webmanifest");
  eq(res.status, 200, "status");
  has(JSON.stringify(await res.json()), "Aurum Desk");
});

console.log("\nSecurity headers");
const home = await get("/");
const h = (name) => home.headers.get(name) ?? "";
await check("Content-Security-Policy restricts sources", async () => {
  const csp = h("content-security-policy");
  has(csp, "default-src 'self'", "CSP");
  has(csp, "frame-ancestors 'none'", "CSP");
  has(csp, "object-src 'none'", "CSP");
});
await check("clickjacking and sniffing protections", async () => {
  eq(h("x-frame-options"), "DENY", "X-Frame-Options");
  eq(h("x-content-type-options"), "nosniff", "X-Content-Type-Options");
});
await check("framework banner is hidden", async () => eq(h("x-powered-by"), "", "X-Powered-By"));
for (const p of ["/reset", "/verify"]) {
  await check(`${p} sends no Referer (it carries a one-time token)`, async () =>
    eq((await get(p)).headers.get("referrer-policy"), "no-referrer", "Referrer-Policy"));
}

console.log("\nAPI");
await check("/api/auth/me answers signed-out and is not cacheable", async () => {
  const res = await get("/api/auth/me");
  eq(res.status, 200, "status");
  eq((await res.json()).user, null, "user");
  has(res.headers.get("cache-control") ?? "", "no-store", "Cache-Control");
});
await check("/api/signals returns a list", async () => {
  const res = await get("/api/signals");
  eq(res.status, 200, "status");
  if (!Array.isArray((await res.json()).signals)) throw new Error("signals is not an array");
});
await check("/api/gold rejects an unknown timeframe", async () => eq((await get("/api/gold?tf=7m")).status, 400, "status"));
await check("/api/gold answers (data, or a clear no-key/quota error)", async () => {
  const res = await get("/api/gold?tf=1h&tail=2");
  if (![200, 429, 502, 503].includes(res.status)) throw new Error(`unexpected status ${res.status}`);
  if (res.status === 200) eq((await res.json()).candles.length, 2, "tail length");
});
await check("sign-up without an Origin header is refused (CSRF guard)", async () =>
  eq((await post("/api/auth/signup", { email: "x@example.test", password: "irrelevant-password" })).status, 403, "status"));
await check("sign-up from a foreign Origin is refused", async () =>
  eq((await post("/api/auth/signup", { email: "x@example.test", password: "irrelevant-password" }, { Origin: "https://evil.example" })).status, 403, "status"));
await check("sign-in with bad credentials gives a generic 401", async () => {
  const res = await post("/api/auth/login", { email: "nobody@example.test", password: "wrong-password-123" }, { Origin: origin });
  if (![401, 429].includes(res.status)) throw new Error(`unexpected status ${res.status}`);
});
await check("account-only routes refuse anonymous callers", async () => {
  eq((await post("/api/auth/prefs", {}, { Origin: origin }, "PUT")).status, 401, "prefs");
  eq((await post("/api/auth/password", {}, { Origin: origin })).status, 401, "password");
  eq((await post("/api/auth/logout-all", {}, { Origin: origin })).status, 401, "logout-all");
});

if (withAuth) {
  console.log("\nAccount flow (throwaway account, deleted at the end)");
  const email = `smoke-${Date.now()}@example.test`;
  const pw1 = `Smoke-${Math.random().toString(36).slice(2)}-A1`;
  const pw2 = `Smoke-${Math.random().toString(36).slice(2)}-B2`;
  let cookie = "";
  const authed = (extra = {}) => ({ Origin: origin, Cookie: cookie, ...extra });
  const cookieFrom = (res) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("aurum_session=")) ?? "";

  await check("sign up", async () => {
    const res = await post("/api/auth/signup", { email, password: pw1 }, { Origin: origin });
    eq(res.status, 201, "status");
    cookie = cookieFrom(res);
    if (!cookie) throw new Error("no session cookie issued");
    has((res.headers.getSetCookie?.() ?? []).join(";").toLowerCase(), "httponly", "Set-Cookie");
  });
  await check("session works", async () => eq((await (await get("/api/auth/me", { headers: { Cookie: cookie } })).json()).user?.email, email, "email"));
  await check("change password (wrong current is refused, correct works)", async () => {
    eq((await post("/api/auth/password", { currentPassword: "wrong-password-xx", newPassword: pw2 }, authed())).status, 401, "wrong current");
    eq((await post("/api/auth/password", { currentPassword: pw1, newPassword: pw2 }, authed())).status, 200, "correct");
  });
  await check("sign in with the new password", async () => {
    const res = await post("/api/auth/login", { email, password: pw2 }, { Origin: origin });
    eq(res.status, 200, "status");
    cookie = cookieFrom(res);
  });
  await check("sign out everywhere ends the session", async () => {
    eq((await post("/api/auth/logout-all", {}, authed())).status, 200, "status");
    eq((await (await get("/api/auth/me", { headers: { Cookie: cookie } })).json()).user, null, "user after");
  });
  await check("delete the throwaway account", async () => {
    const res = await post("/api/auth/login", { email, password: pw2 }, { Origin: origin });
    cookie = cookieFrom(res);
    eq((await post("/api/auth/account", { password: pw2 }, authed(), "DELETE")).status, 200, "status");
    eq((await post("/api/auth/login", { email, password: pw2 }, { Origin: origin })).status, 401, "login after delete");
  });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("Failed:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
