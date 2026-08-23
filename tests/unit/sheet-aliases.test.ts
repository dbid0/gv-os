import { describe, expect, it } from "vitest";

import { matchesSheetClient } from "@/lib/clients/sheet-aliases";

describe("matchesSheetClient", () => {
  it("maps the real sheet spellings to their clients", () => {
    expect(matchesSheetClient("the-grid", "Kaden (AI)")).toBe(true);
    expect(matchesSheetClient("the-vault", "Brady Stein")).toBe(true);
    expect(matchesSheetClient("racks-closes", "Aiden Racks")).toBe(true);
    expect(matchesSheetClient("the-visionary", "Tico Visuals")).toBe(true);
  });

  it("never cross-matches other sheet names", () => {
    for (const other of [
      "Kaitlin Torres",
      "Eric & Ahmet (The Jungle)",
      "Jordan Boshoff (Elevate CS)",
      "Snoozer",
      "David Brown",
      "Sean Casey",
      "Jesus",
      "Jayden",
    ]) {
      expect(matchesSheetClient("the-grid", other)).toBe(false);
      expect(matchesSheetClient("the-vault", other)).toBe(false);
      expect(matchesSheetClient("racks-closes", other)).toBe(false);
      expect(matchesSheetClient("the-visionary", other)).toBe(false);
    }
  });

  it("returns false for unknown slugs", () => {
    expect(matchesSheetClient("unknown-client", "Kaden (AI)")).toBe(false);
  });
});
