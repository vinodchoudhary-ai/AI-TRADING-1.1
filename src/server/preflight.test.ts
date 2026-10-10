import { describe, expect, it, vi } from "vitest";
import { logReport, readinessReport } from "./preflight";

const FULL = {
  NODE_ENV: "production", APP_URL: "https://aurum.example", SMTP_URL: "smtps://u:p@smtp.example:465",
  MAIL_FROM: "Aurum <no-reply@aurum.example>", TWELVEDATA_API_KEY: "k", DATABASE_FILE: "/data/aurum.db",
};
const codes = (f: { code: string }[]) => f.map((x) => x.code).sort();

describe("readinessReport", () => {
  it("reports nothing for a fully configured production setup", () => {
    expect(readinessReport(FULL, [], "24.20.0")).toEqual([]);
  });

  it("flags every missing production setting once", () => {
    const f = readinessReport({ NODE_ENV: "production" }, ["operator", "contactEmail"], "24.20.0");
    expect(codes(f)).toEqual(["app-url", "database-path", "email", "gold-key", "site-details"]);
  });

  it("names the exact variables to set for unfilled site details", () => {
    const f = readinessReport({ ...FULL }, ["operator", "jurisdiction"], "24.20.0");
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain("NEXT_PUBLIC_SITE_OPERATOR");
    expect(f[0].message).toContain("NEXT_PUBLIC_SITE_JURISDICTION");
    expect(f[0].message).not.toContain("CONTACT_EMAIL");
  });

  it("warns when the site address is not https", () => {
    expect(codes(readinessReport({ ...FULL, APP_URL: "http://aurum.example" }, [], "24.20.0"))).toEqual(["app-url-https"]);
  });

  it("treats a half-configured email setup as unconfigured", () => {
    expect(codes(readinessReport({ ...FULL, MAIL_FROM: "" }, [], "24.20.0"))).toEqual(["email"]);
  });

  it("rejects a nonsense gold budget but not an unset one", () => {
    expect(codes(readinessReport({ ...FULL, GOLD_DAILY_BUDGET: "lots" }, [], "24.20.0"))).toEqual(["gold-budget"]);
    expect(codes(readinessReport({ ...FULL, GOLD_DAILY_BUDGET: "0" }, [], "24.20.0"))).toEqual(["gold-budget"]);
    expect(readinessReport({ ...FULL, GOLD_DAILY_BUDGET: "500" }, [], "24.20.0")).toEqual([]);
    expect(readinessReport(FULL, [], "24.20.0")).toEqual([]);
  });

  it("is quiet in development, except for an unsupported Node version", () => {
    expect(readinessReport({ NODE_ENV: "development" }, ["operator"], "24.20.0")).toEqual([]);
    const f = readinessReport({ NODE_ENV: "development" }, [], "20.11.0");
    expect(f).toEqual([expect.objectContaining({ level: "error", code: "node-version" })]);
  });

  it("accepts the minimum supported Node and rejects just below it", () => {
    expect(readinessReport({ NODE_ENV: "development" }, [], "22.13.0")).toEqual([]);
    expect(codes(readinessReport({ NODE_ENV: "development" }, [], "22.12.9"))).toEqual(["node-version"]);
  });
});

describe("logReport", () => {
  it("prints a single ready line when there is nothing to fix", () => {
    const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    logReport([], log);
    expect(log.log).toHaveBeenCalledWith("[preflight] configuration looks ready");
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("prints a header and one line per finding, errors on the error channel", () => {
    const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    logReport([
      { level: "warn", code: "email", message: "no smtp" },
      { level: "error", code: "node-version", message: "too old" },
    ], log);
    expect(log.warn).toHaveBeenCalledWith("[preflight] 2 item(s) to fix before launch:");
    expect(log.warn).toHaveBeenCalledWith("[preflight]   WARN email: no smtp");
    expect(log.error).toHaveBeenCalledWith("[preflight]   ERROR node-version: too old");
  });
});
