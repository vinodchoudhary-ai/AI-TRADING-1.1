import { describe, expect, it } from "vitest";
import { hasPlaceholders, SITE } from "../config/site";
import { fill, LEGAL, type LegalDoc } from "./legal";

const filled = {
  brand: "Acme Desk",
  operator: "Acme Ltd",
  contactEmail: "hello@acme.example",
  jurisdiction: "the laws of India",
  legalUpdated: "2026-10-09",
};

const everyText = (d: LegalDoc) =>
  [d.title, d.intro, ...d.sections.flatMap((s) => [s.heading, ...(s.body ?? []), ...(s.list ?? [])])];

describe("legal content", () => {
  it("has the same structure in English and Hindi", () => {
    for (const kind of ["privacy", "terms"] as const) {
      const { en, hi } = LEGAL[kind];
      expect(hi.sections).toHaveLength(en.sections.length);
      hi.sections.forEach((s, i) => {
        expect(s.body?.length ?? 0).toBe(en.sections[i].body?.length ?? 0);
        expect(s.list?.length ?? 0).toBe(en.sections[i].list?.length ?? 0);
      });
    }
  });

  it("uses only known placeholders, and fill() leaves none behind", () => {
    for (const kind of ["privacy", "terms"] as const) {
      for (const lang of ["en", "hi"] as const) {
        for (const text of everyText(LEGAL[kind][lang])) {
          expect(fill(text, filled)).not.toMatch(/[{}]/);
        }
      }
    }
  });

  it("puts the configured operator and contact into the text", () => {
    expect(fill("{operator} at {contact}, {jurisdiction}", filled)).toBe("Acme Ltd at hello@acme.example, the laws of India");
  });

  it("flags unfilled placeholders but not a completed config", () => {
    expect(hasPlaceholders(SITE)).toBe(true);
    expect(hasPlaceholders(filled)).toBe(false);
  });

  it("has no empty sections", () => {
    for (const kind of ["privacy", "terms"] as const) {
      for (const lang of ["en", "hi"] as const) {
        for (const s of LEGAL[kind][lang].sections) {
          expect(s.heading.length).toBeGreaterThan(0);
          expect((s.body?.length ?? 0) + (s.list?.length ?? 0)).toBeGreaterThan(0);
        }
      }
    }
  });
});
