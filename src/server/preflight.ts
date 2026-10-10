export type Level = "error" | "warn";

export interface Finding {
  level: Level;
  /** Stable id, useful in logs and tests. */
  code: string;
  message: string;
}

type Env = Record<string, string | undefined>;

const atLeast = (version: string, min: [number, number]): boolean => {
  const [maj, min2] = version.split(".").map(Number);
  return maj > min[0] || (maj === min[0] && min2 >= min[1]);
};

/**
 * What still needs doing before this is ready for real visitors. Pure: pass in the environment and the
 * unfilled site fields. In development almost everything is optional, so findings are only produced for
 * production, plus a Node version check that applies everywhere.
 */
export function readinessReport(env: Env, unfilledSite: string[], nodeVersion: string): Finding[] {
  const out: Finding[] = [];
  const add = (level: Level, code: string, message: string) => out.push({ level, code, message });

  if (!atLeast(nodeVersion, [22, 13])) {
    add("error", "node-version", `Node ${nodeVersion} is too old: the database needs Node 22.13 or newer (24 LTS recommended).`);
  }
  if (env.NODE_ENV !== "production") return out;

  const budget = env.GOLD_DAILY_BUDGET;
  if (budget !== undefined && budget !== "" && !(Number(budget) > 0)) {
    add("error", "gold-budget", "GOLD_DAILY_BUDGET is not a positive number; the default (700) is used only when it is unset.");
  }
  if (!env.APP_URL) {
    add("warn", "app-url", "APP_URL is not set: verification and reset emails are not sent, and robots.txt / sitemap.xml have no absolute URLs.");
  } else if (!env.APP_URL.startsWith("https://")) {
    add("warn", "app-url-https", "APP_URL is not https: session cookies will not be marked Secure. Serve the site over HTTPS.");
  }
  if (!env.SMTP_URL || !env.MAIL_FROM) {
    add("warn", "email", "SMTP_URL and MAIL_FROM are not both set: email verification and password reset are switched off.");
  }
  if (!env.TWELVEDATA_API_KEY) {
    add("warn", "gold-key", "TWELVEDATA_API_KEY is not set: gold shows labelled sample data, the analysis is off for gold, and the tracker skips it.");
  }
  if (!env.DATABASE_FILE) {
    add("warn", "database-path", "DATABASE_FILE is not set: the database is inside the app folder. Point it at persistent storage so it survives redeploys.");
  }
  if (unfilledSite.length > 0) {
    add("warn", "site-details", `Public pages still show a draft notice: set ${unfilledSite.map((f) => siteVar[f] ?? f).join(", ")} when building.`);
  }
  return out;
}

const siteVar: Record<string, string> = {
  operator: "NEXT_PUBLIC_SITE_OPERATOR",
  contactEmail: "NEXT_PUBLIC_SITE_CONTACT_EMAIL",
  jurisdiction: "NEXT_PUBLIC_SITE_JURISDICTION",
};

/** Writes the report to the log as a short, scannable block. */
export function logReport(findings: Finding[], log: Pick<Console, "log" | "warn" | "error"> = console): void {
  if (findings.length === 0) {
    log.log("[preflight] configuration looks ready");
    return;
  }
  log.warn(`[preflight] ${findings.length} item(s) to fix before launch:`);
  for (const f of findings) (f.level === "error" ? log.error : log.warn)(`[preflight]   ${f.level.toUpperCase()} ${f.code}: ${f.message}`);
}
