import { describe, expect, it } from "vitest";

import { monthToDateCashCents, parseTargetDollars } from "@/lib/clients/targets";

// 8pm CT Aug 22 = 01:00 UTC Aug 23 — the CT month must win.
const NOW = new Date("2026-08-23T01:00:00Z");

const ROWS = [
  { client: "Kaden (AI)", dateClosed: "2026-08-06", cashCents: 100_000 },
  { client: "Kaden (AI)", dateClosed: "2026-08-20", cashCents: 250_000 },
  { client: "Kaden (AI)", dateClosed: "2026-07-31", cashCents: 999_999 }, // last month
  { client: "Brady Stein", dateClosed: "2026-08-10", cashCents: 400_000 }, // other client
  { client: "Sean Casey", dateClosed: "2026-08-12", cashCents: 777_777 }, // unmatched
];

describe("monthToDateCashCents", () => {
  it("sums only this client's deals closed in the current CT month", () => {
    expect(monthToDateCashCents(ROWS, "the-grid", NOW)).toBe(350_000);
    expect(monthToDateCashCents(ROWS, "the-vault", NOW)).toBe(400_000);
  });

  it("is zero for a client with no deals this month", () => {
    expect(monthToDateCashCents(ROWS, "racks-closes", NOW)).toBe(0);
    expect(monthToDateCashCents([], "the-grid", NOW)).toBe(0);
  });
});

describe("parseTargetDollars", () => {
  it("parses dollars, commas, and $ signs to integer cents", () => {
    expect(parseTargetDollars("25000")).toBe(2_500_000);
    expect(parseTargetDollars("$25,000")).toBe(2_500_000);
    expect(parseTargetDollars("1499.50")).toBe(149_950);
  });

  it("empty clears, junk is invalid", () => {
    expect(parseTargetDollars("")).toBeNull();
    expect(parseTargetDollars("   ")).toBeNull();
    expect(parseTargetDollars("abc")).toBe("invalid");
    expect(parseTargetDollars("-5")).toBe("invalid");
    expect(parseTargetDollars("999999999999")).toBe("invalid");
  });
});
