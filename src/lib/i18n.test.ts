import { describe, expect, it } from "vitest";
import { translate } from "./i18n";

describe("i18n", () => {
  it("translates and interpolates", () => {
    expect(translate("en", "hist.hidden", { min: 20, n: 3 })).toContain("20 resolved signals (3 so far)");
    expect(translate("hi", "hist.rate", { pct: 55, n: 40 })).toContain("55%");
  });
  it("hindi differs from english for nav labels", () => {
    expect(translate("hi", "nav.chart")).not.toBe(translate("en", "nav.chart"));
  });
});
