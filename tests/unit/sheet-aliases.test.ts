import { describe, expect, it } from "vitest";

import { matchesSheetClient } from "@/lib/clients/sheet-aliases";

describe("matchesSheetClient", () => {
  it("maps the real sheet spellings to their clients", () => {
    expect(matchesSheetClient("the-grid", "Kaden (AI)")).toBe(true);
    expect(matchesSheetClient("the-visionary", "Tico Visuals")).toBe(true);
  });

  it("never cross-matches other sheet names", () => {
    for (const other of [
      "Kaitlin Torres",
      "Eric & Ahmet (The Jungle)",
      "Jordan Boshoff (Elevate CS)",
      "Snoozer",
      // Retired September 2026 — their sheet rows must no longer attribute
      // to any live offer.
      "Brady Stein",
      "Aiden Racks",
      "David Brown",
      "Sean Casey",
      "Jesus",
      "Jayden",
    ]) {
      expect(matchesSheetClient("the-grid", other)).toBe(false);
      expect(matchesSheetClient("the-visionary", other)).toBe(false);
    }
  });

  it("returns false for unknown slugs", () => {
    expect(matchesSheetClient("unknown-client", "Kaden (AI)")).toBe(false);
  });
});
