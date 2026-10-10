// Edit these before launch. Anything still in [square brackets] is treated as an unfilled
// placeholder: the Privacy and Terms pages then show a visible "draft" notice.
export const SITE = {
  brand: "Aurum Desk",
  operator: "[Operator legal name]",
  contactEmail: "[contact email]",
  jurisdiction: "[governing jurisdiction, e.g. the laws of India]",
  /** ISO date; update whenever the Privacy or Terms text changes. */
  legalUpdated: "2026-10-09",
} as const;

export const hasPlaceholders = (site: Record<string, string> = SITE): boolean =>
  Object.values(site).some((v) => v.trim().startsWith("["));
