import { describe, expect, it } from "vitest";

import {
  moneyCalendar,
  partialDealAr,
  revShareOwed,
  type ArBacklogRow,
} from "@/lib/transactions/ar";

const row = (o: Partial<ArBacklogRow>): ArBacklogRow => ({
  direction: "in",
  layer: "agency",
  occurredOn: "2026-07-31",
  description: "Sean Casey",
  clientName: null,
  dealType: "Setup",
  revenueCents: 1_000_000,
  cashCents: 100_000,
  ...o,
});

describe("partialDealAr", () => {
  it("finds revenue booked above cash, largest first", () => {
    const items = partialDealAr([
      row({}),
      row({ description: "David Brown", revenueCents: 750_000, cashCents: 200_000 }),
      row({ description: "Paid in full", revenueCents: 100_000, cashCents: 100_000 }),
      row({ direction: "out", revenueCents: 999, cashCents: 0 }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "partial",
      label: "Sean Casey",
      month: "2026-07",
      aroseOn: "2026-07-31",
      arCents: 900_000,
    });
    expect(items[1].arCents).toBe(550_000);
  });

  it("prefers the joined client name for the label", () => {
    const items = partialDealAr([row({ clientName: "The Grid" })]);
    expect(items[0].label).toBe("The Grid");
  });
});

describe("revShareOwed", () => {
  const LINES = [
    { clientId: "g", clientName: "The Grid", month: "2026-07", revShareCents: 50_000 },
    { clientId: "g", clientName: "The Grid", month: "2026-08", revShareCents: 80_000 },
    { clientId: "v", clientName: "The Vault", month: "2026-08", revShareCents: 30_000 },
  ];

  it("retires the oldest month first with what was received", () => {
    const items = revShareOwed(LINES, [{ clientId: "g", cashCents: 60_000 }]);
    // July's 50k fully retired, August keeps 70k.
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      label: "The Grid — rev-share 2026-08",
      arCents: 70_000,
    });
    expect(items[1]).toMatchObject({
      label: "The Vault — rev-share 2026-08",
      arCents: 30_000,
    });
  });

  it("owes everything with no receipts, nothing when overpaid", () => {
    expect(revShareOwed(LINES, [])).toHaveLength(3);
    expect(
      revShareOwed(LINES, [
        { clientId: "g", cashCents: 999_999 },
        { clientId: "v", cashCents: 999_999 },
        { clientId: null, cashCents: 5 },
      ]),
    ).toEqual([]);
  });
});

describe("moneyCalendar", () => {
  it("lays owed-in and planned-out on one monthly timeline, oldest first", () => {
    const months = moneyCalendar(
      [
        { kind: "partial", label: "a", month: "2026-08", aroseOn: null, arCents: 100 },
        { kind: "revshare", label: "b", month: "2026-07", aroseOn: null, arCents: 50 },
      ],
      [
        { month: "2026-08", totalCents: 40, kind: "partner" },
        { month: "2026-08", totalCents: 25, kind: "revshare_received" },
      ],
    );
    expect(months).toEqual([
      { month: "2026-07", owedInCents: 50, plannedOutCents: 0 },
      { month: "2026-08", owedInCents: 125, plannedOutCents: 40 },
    ]);
  });

  it("is empty on empty inputs", () => {
    expect(moneyCalendar([], [])).toEqual([]);
  });
});
