import { describe, expect, it } from "vitest";

import {
  findDuplicateDeal,
  isSameDeal,
  rawDealRow,
  type DealIdentity,
} from "@/lib/accounting/deal-dedupe";

const deal: DealIdentity = {
  dateClosed: "2026-09-04",
  client: "Kaden (AI)",
  dealType: "Setup",
  revenueCents: 750_000,
  cashCents: 750_000,
};

// A Raw Data row as financeRawRow writes it: A..M.
const sheetRow = (over: Partial<Record<number, string>> = {}): string[] => {
  const row = [
    "9/4/2026 10:15:00", // A timestamp
    "2026-09-04", // B date closed
    "Kaden (AI)", // C client
    "Setup", // D deal type
    "The Grid", // E offer
    "7500.00", // F revenue
    "7500.00", // G cash
    "Stripe", // H method
    "",
    "",
    "Yes",
    "",
    "Pending",
  ];
  for (const [i, v] of Object.entries(over)) row[Number(i)] = v ?? "";
  return row;
};

describe("isSameDeal", () => {
  it("matches the same deal logged again after a failed-looking request", () => {
    // The real case: the append succeeded, the response never arrived, the
    // person logged it a second time. The timestamp differs; nothing else does.
    expect(isSameDeal(rawDealRow(sheetRow({ 0: "9/4/2026 10:41:00" })), deal)).toBe(
      true,
    );
  });

  it("matches however the sheet formatted the money", () => {
    expect(
      isSameDeal(rawDealRow(sheetRow({ 5: "$7,500.00", 6: "$7,500.00" })), deal),
    ).toBe(true);
    expect(isSameDeal(rawDealRow(sheetRow({ 5: "7500", 6: "7500" })), deal)).toBe(true);
  });

  it("ignores case and stray spacing in the names", () => {
    expect(isSameDeal(rawDealRow(sheetRow({ 2: "  kaden   (AI) " })), deal)).toBe(true);
  });

  it("does NOT match a different amount, client, date or type", () => {
    expect(isSameDeal(rawDealRow(sheetRow({ 6: "5000.00" })), deal)).toBe(false);
    expect(isSameDeal(rawDealRow(sheetRow({ 2: "Brady" })), deal)).toBe(false);
    expect(isSameDeal(rawDealRow(sheetRow({ 1: "2026-09-03" })), deal)).toBe(false);
    expect(isSameDeal(rawDealRow(sheetRow({ 3: "Rev-Share" })), deal)).toBe(false);
  });

  it("does not match a row whose money cannot be read", () => {
    // Refusing to log real money because a neighbouring row is malformed
    // would be the worse failure.
    expect(isSameDeal(rawDealRow(sheetRow({ 5: "#ERROR!" })), deal)).toBe(false);
    expect(isSameDeal(rawDealRow(sheetRow({ 6: "" })), deal)).toBe(false);
  });
});

describe("findDuplicateDeal", () => {
  it("points at the exact sheet row so the warning can be checked", () => {
    const rows = [sheetRow({ 2: "Brady" }), sheetRow({ 2: "Aiden" }), sheetRow()];
    // Rows start at sheet row 2, so the third row is row 4.
    expect(findDuplicateDeal(rows, deal)).toBe(4);
  });

  it("returns the MOST RECENT match when a deal legitimately repeats", () => {
    const rows = [sheetRow(), sheetRow({ 2: "Brady" }), sheetRow()];
    expect(findDuplicateDeal(rows, deal)).toBe(4);
  });

  it("is null when nothing matches, and for an empty sheet", () => {
    expect(findDuplicateDeal([sheetRow({ 2: "Brady" })], deal)).toBeNull();
    expect(findDuplicateDeal([], deal)).toBeNull();
  });

  it("survives short rows without throwing", () => {
    // A half-filled row in the sheet must not break logging a deal.
    expect(findDuplicateDeal([[], ["x"], ["a", "b"]], deal)).toBeNull();
  });
});
