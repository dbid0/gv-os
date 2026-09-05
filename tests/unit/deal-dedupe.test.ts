import { describe, expect, it } from "vitest";

import {
  findDuplicateDeal,
  findRecentDuplicateDeal,
  type LoggedDeal,
  type LoggedDealIdentity,
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

describe("findRecentDuplicateDeal", () => {
  const now = new Date("2026-09-04T15:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  const logged = (over: Partial<LoggedDeal> = {}): LoggedDeal => ({
    clientId: "client-grid",
    customerName: "Julian Schiederer",
    dealType: "One Call Close",
    contractValueCents: 750_000,
    cashCents: 250_000,
    closedAt: minutesAgo(3),
    ...over,
  });

  const identity: LoggedDealIdentity = {
    clientId: "client-grid",
    customerName: "Julian Schiederer",
    dealType: "One Call Close",
    contractValueCents: 750_000,
    cashCents: 250_000,
  };

  it("catches the same sale submitted twice minutes apart", () => {
    expect(findRecentDuplicateDeal([logged()], identity, now)).not.toBeNull();
  });

  it("does not catch the same customer on a DIFFERENT offer", () => {
    // Two offers can genuinely sell the same person.
    expect(
      findRecentDuplicateDeal([logged({ clientId: "client-vault" })], identity, now),
    ).toBeNull();
  });

  it("does not catch a different amount or deal type", () => {
    expect(
      findRecentDuplicateDeal([logged({ cashCents: 1 })], identity, now),
    ).toBeNull();
    expect(
      findRecentDuplicateDeal([logged({ contractValueCents: 1 })], identity, now),
    ).toBeNull();
    expect(
      findRecentDuplicateDeal([logged({ dealType: "Payment Plan" })], identity, now),
    ).toBeNull();
  });

  it("does not catch a different customer", () => {
    expect(
      findRecentDuplicateDeal(
        [logged({ customerName: "Someone Else" })],
        identity,
        now,
      ),
    ).toBeNull();
  });

  it("still catches two UNNAMED deals of the same size", () => {
    // A double-submit of a form filled once looks exactly like this.
    expect(
      findRecentDuplicateDeal(
        [logged({ customerName: null })],
        { ...identity, customerName: null },
        now,
      ),
    ).not.toBeNull();
  });

  it("catches a duplicate even when the driver returned cents as STRINGS", () => {
    // bigint columns come back as strings from a raw driver, and "750000"
    // !== 750000 fails silently — no duplicate found, deal written twice.
    const asStrings = logged({
      contractValueCents: "750000" as unknown as number,
      cashCents: "250000" as unknown as number,
    });
    expect(findRecentDuplicateDeal([asStrings], identity, now)).not.toBeNull();
  });

  it("does not treat an unreadable amount as a match", () => {
    const bad = logged({ contractValueCents: "not-a-number" as unknown as number });
    expect(findRecentDuplicateDeal([bad], identity, now)).toBeNull();
  });

  it("catches a deal the database stamped microseconds into the future", () => {
    // Real failure: the row is stamped by the DB and the window is measured
    // against the app's clock, so a just-inserted deal read as future-dated
    // and slipped straight past the guard.
    const skewed = logged({ closedAt: new Date(now.getTime() + 25) });
    expect(findRecentDuplicateDeal([skewed], identity, now)).not.toBeNull();
  });

  it("lets the same deal through once it is genuinely old", () => {
    // A month later, the same client buying the same package again is a
    // second sale, not a mis-click.
    const old = logged({
      closedAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
    });
    expect(findRecentDuplicateDeal([old], identity, now)).toBeNull();
  });

  it("ignores a deal with no close date rather than guessing its age", () => {
    expect(
      findRecentDuplicateDeal([logged({ closedAt: null })], identity, now),
    ).toBeNull();
  });

  it("is null for an empty book", () => {
    expect(findRecentDuplicateDeal([], identity, now)).toBeNull();
  });
});
