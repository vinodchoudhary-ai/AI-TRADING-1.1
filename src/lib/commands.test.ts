import { describe, expect, it } from "vitest";
import { filterCommands, type Command } from "./commands";

const mk = (id: string, label: string, keywords: string): Command => ({ id, label, keywords, group: "g", run: () => {} });
const list = [mk("chart", "चार्ट", "chart price"), mk("btc", "Show BTC/USD", "bitcoin crypto"), mk("risk", "Risk", "disclosure")];

describe("filterCommands", () => {
  it("returns everything for an empty query", () => {
    expect(filterCommands(list, "  ")).toHaveLength(3);
  });
  it("matches English keywords even when the label is Hindi", () => {
    expect(filterCommands(list, "chart").map((c) => c.id)).toEqual(["chart"]);
  });
  it("requires every word to match, case-insensitively", () => {
    expect(filterCommands(list, "BITCOIN usd").map((c) => c.id)).toEqual(["btc"]);
    expect(filterCommands(list, "bitcoin risk")).toHaveLength(0);
  });
});
