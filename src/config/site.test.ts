import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return import("./site");
}

describe("site config", () => {
  it("defaults to placeholders, so the legal pages show their draft notice", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_OPERATOR", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_CONTACT_EMAIL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_JURISDICTION", "");
    const m = await load();
    expect(m.hasPlaceholders(m.SITE)).toBe(true);
    expect(m.unfilledSiteFields(m.SITE).sort()).toEqual(["contactEmail", "jurisdiction", "operator"]);
  });

  it("reads real values from the environment, trimmed, and clears the draft state when all are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_OPERATOR", "  Acme Ltd ");
    vi.stubEnv("NEXT_PUBLIC_SITE_CONTACT_EMAIL", "hello@acme.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_JURISDICTION", "the laws of India");
    const m = await load();
    expect(m.SITE.operator).toBe("Acme Ltd");
    expect(m.SITE.contactEmail).toBe("hello@acme.example");
    expect(m.hasPlaceholders(m.SITE)).toBe(false);
    expect(m.unfilledSiteFields(m.SITE)).toEqual([]);
  });

  it("one missing value is enough to keep the draft notice", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_OPERATOR", "Acme Ltd");
    vi.stubEnv("NEXT_PUBLIC_SITE_CONTACT_EMAIL", "hello@acme.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_JURISDICTION", "");
    const m = await load();
    expect(m.unfilledSiteFields(m.SITE)).toEqual(["jurisdiction"]);
  });

  it("pick ignores empty and whitespace-only values", async () => {
    const { pick } = await load();
    expect(pick(undefined, "x")).toBe("x");
    expect(pick("   ", "x")).toBe("x");
    expect(pick(" y ", "x")).toBe("y");
  });
});
