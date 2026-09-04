import { describe, expect, it } from "vitest";

import {
  conflictingOwner,
  looksLikeSheetId,
  normalizeSheetId,
  type SheetOwner,
} from "@/lib/tracking/sheet-link";

const GRID_ID = "1rC3yHTzkwWodrNpfxKP3H_YPyHRph4ebWrSlQ3cGthY";
const RACKS_ID = "1xQ9GkyStP9P56QE3jcDdQflpAFtyhjmBkvfVSrDMrpM";

const owners: SheetOwner[] = [
  { clientId: "c-grid", slug: "the-grid", name: "The Grid", trackingSheetId: GRID_ID },
  {
    clientId: "c-racks",
    slug: "racks-closes",
    name: "Racks Closes",
    trackingSheetId: RACKS_ID,
  },
  { clientId: "c-vault", slug: "the-vault", name: "The Vault", trackingSheetId: null },
];

describe("normalizeSheetId", () => {
  it("takes the id out of a pasted URL", () => {
    expect(
      normalizeSheetId(`https://docs.google.com/spreadsheets/d/${GRID_ID}/edit#gid=0`),
    ).toBe(GRID_ID);
  });

  it("passes a bare id through", () => {
    expect(normalizeSheetId(`  ${GRID_ID}  `)).toBe(GRID_ID);
  });

  it("is empty-safe", () => {
    expect(normalizeSheetId("")).toBe("");
    expect(normalizeSheetId("   ")).toBe("");
  });
});

describe("conflictingOwner", () => {
  it("CATCHES pointing a second offer at a sheet another offer owns", () => {
    // The worst thing this mirror can do: Racks' workspace showing The Grid's
    // prospects, deals and recordings, with nothing on screen looking wrong.
    const clash = conflictingOwner(GRID_ID, "c-vault", owners);
    expect(clash?.name).toBe("The Grid");
  });

  it("catches it when the URL was pasted instead of the id", () => {
    const clash = conflictingOwner(
      `https://docs.google.com/spreadsheets/d/${RACKS_ID}/edit`,
      "c-vault",
      owners,
    );
    expect(clash?.name).toBe("Racks Closes");
  });

  it("allows re-saving the same id on the SAME offer", () => {
    // Pressing save twice is not a conflict.
    expect(conflictingOwner(GRID_ID, "c-grid", owners)).toBeNull();
  });

  it("allows a genuinely new sheet", () => {
    // The case Daniel described: a fresh sheet for the new month.
    expect(
      conflictingOwner("1newSheetIdForSeptember2026xxxxxxxxx", "c-grid", owners),
    ).toBeNull();
  });

  it("treats clearing the link as no conflict", () => {
    expect(conflictingOwner("", "c-grid", owners)).toBeNull();
  });

  it("ignores offers with no sheet linked", () => {
    expect(conflictingOwner("anything-unused-here-x", "c-grid", owners)).toBeNull();
  });
});

describe("looksLikeSheetId", () => {
  it("accepts a real id and rejects obvious mistakes", () => {
    expect(looksLikeSheetId(GRID_ID)).toBe(true);
    expect(looksLikeSheetId("too-short")).toBe(false);
    expect(looksLikeSheetId("has spaces in it and is long enough")).toBe(false);
  });
});
