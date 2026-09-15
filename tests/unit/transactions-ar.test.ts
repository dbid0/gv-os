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
  description: "Lee Summers",
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
      row({ description: "Chris Dale", revenueCents: 750_000, cashCents: 200_000 }),
      row({ description: "Paid in full", revenueCents: 100_000, cashCents: 100_000 }),
      row({ direction: "out", revenueCents: 999, cashCents: 0 }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "partial",
      label: "Lee Summers",
      month: "2026-07",
      aroseOn: "2026-07-31",
      arCents: 900_000,
    });
    expect(items[1].arCents).toBe(550_000);
  });

  it("prefers the joined client name for the label", () => {
    const items = partialDealAr([row({ clientName: "Client North" })]);
    expect(items[0].label).toBe("Client North");
  });

  it("labels a deal with neither client name nor description as unlabeled", () => {
    const items = partialDealAr([row({ description: null, clientName: null })]);
    expect(items).toEqual([
      {
        kind: "partial",
        label: "Unlabeled deal",
        month: "2026-07",
        aroseOn: "2026-07-31",
        arCents: 900_000,
      },
    ]);
  });
});

describe("revShareOwed", () => {
  const LINES = [
    {
      clientId: "g",
      clientName: "Client North",
      month: "2026-07",
      revShareCents: 50_000,
    },
    {
      clientId: "g",
      clientName: "Client North",
      month: "2026-08",
      revShareCents: 80_000,
    },
    {
      clientId: "v",
      clientName: "Client South",
      month: "2026-08",
      revShareCents: 30_000,
    },
  ];

  it("retires the oldest month first with what was received", () => {
    const items = revShareOwed(LINES, [{ clientId: "g", cashCents: 60_000 }]);
    // July's 50k fully retired, August keeps 70k.
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      label: "Client North — rev-share 2026-08",
      arCents: 70_000,
    });
    expect(items[1]).toMatchObject({
      label: "Client South — rev-share 2026-08",
      arCents: 30_000,
    });
  });

  it("retires the oldest month first even when lines arrive newest first", () => {
    const lines = [
      {
        clientId: "n",
        clientName: "Client North",
        month: "2026-09",
        revShareCents: 40_000,
      },
      {
        clientId: "n",
        clientName: "Client North",
        month: "2026-07",
        revShareCents: 25_000,
      },
      {
        clientId: "n",
        clientName: "Client North",
        month: "2026-08",
        revShareCents: 30_000,
      },
    ];
    // $350 received: July's $250 retired in full, August keeps $200, September
    // is untouched.
    const items = revShareOwed(lines, [{ clientId: "n", cashCents: 35_000 }]);
    expect(items).toEqual([
      {
        kind: "revshare",
        label: "Client North — rev-share 2026-09",
        month: "2026-09",
        aroseOn: null,
        arCents: 40_000,
      },
      {
        kind: "revshare",
        label: "Client North — rev-share 2026-08",
        month: "2026-08",
        aroseOn: null,
        arCents: 20_000,
      },
    ]);
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

  it("sorts months oldest first whatever order they first appear in", () => {
    const item = (month: string, arCents: number) => ({
      kind: "partial" as const,
      label: "x",
      month,
      aroseOn: null,
      arCents,
    });
    const expected = [
      { month: "2026-06", owedInCents: 10, plannedOutCents: 0 },
      { month: "2026-07", owedInCents: 20, plannedOutCents: 0 },
      { month: "2026-08", owedInCents: 30, plannedOutCents: 5 },
    ];
    const payouts = [{ month: "2026-08", totalCents: 5, kind: "partner" }];
    expect(
      moneyCalendar(
        [item("2026-06", 10), item("2026-07", 20), item("2026-08", 30)],
        payouts,
      ),
    ).toEqual(expected);
    expect(
      moneyCalendar(
        [item("2026-08", 30), item("2026-06", 10), item("2026-07", 20)],
        payouts,
      ),
    ).toEqual(expected);
  });

  it("is empty on empty inputs", () => {
    expect(moneyCalendar([], [])).toEqual([]);
  });
});
