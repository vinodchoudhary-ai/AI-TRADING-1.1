/**
 * Who operates the site. Set these with environment variables when you BUILD (they are shown on public
 * pages, so they are inlined into the build): NEXT_PUBLIC_SITE_BRAND, NEXT_PUBLIC_SITE_OPERATOR,
 * NEXT_PUBLIC_SITE_CONTACT_EMAIL, NEXT_PUBLIC_SITE_JURISDICTION. Anything left unset stays in
 * [square brackets], which the Privacy and Terms pages treat as an unfilled placeholder and show a
 * visible "draft" notice for. These must be real facts about you; they are never made up.
 */
export const pick = (value: string | undefined, fallback: string): string =>
  value && value.trim() ? value.trim() : fallback;

export const SITE = {
  brand: pick(process.env.NEXT_PUBLIC_SITE_BRAND, "Aurum Desk"),
  operator: pick(process.env.NEXT_PUBLIC_SITE_OPERATOR, "[Operator legal name]"),
  contactEmail: pick(process.env.NEXT_PUBLIC_SITE_CONTACT_EMAIL, "[contact email]"),
  jurisdiction: pick(process.env.NEXT_PUBLIC_SITE_JURISDICTION, "[governing jurisdiction, e.g. the laws of India]"),
  /** ISO date; update whenever the Privacy or Terms text changes. */
  legalUpdated: "2026-10-09",
};

export const hasPlaceholders = (site: Record<string, string> = SITE): boolean =>
  Object.values(site).some((v) => v.trim().startsWith("["));

/** Names of the settings that are still placeholders, for the launch-readiness report. */
export const unfilledSiteFields = (site: Record<string, string> = SITE): string[] =>
  Object.entries(site).filter(([, v]) => v.trim().startsWith("[")).map(([k]) => k);
