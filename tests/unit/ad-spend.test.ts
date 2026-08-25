import { describe, expect, it } from "vitest";

import {
  adSpendByClientMonth,
  adSpendTotalCents,
  basisAfterAdSpend,
  type AdSpendRow,
} from "@/lib/revshare/ad-spend";

const rows: AdSpendRow[] = [
  { clientId: "racks", occurredOn: "2026-08-03", amountCents: 100_000 },
  { clientId: "racks", occurredOn: "2026-08-20", amountCents: 250_000 },
  { clientId: "racks", occurredOn: "2026-07-15", amountCents: 50_000 },
  { clientId: "grid", occurredOn: "2026-08-10", amountCents: 999_999 },
];

describe("adSpendByClientMonth", () => {
  it("buckets ad spend by client and month", () => {
    const m = adSpendByClientMonth(rows);
    expect(m.get("racks:2026-08")).toBe(350_000);
    expect(m.get("racks:2026-07")).toBe(50_000);
    expect(m.get("grid:2026-08")).toBe(999_999);
    expect(m.get("racks:2026-06")).toBeUndefined();
  });

  it("is empty for no rows", () => {
    expect(adSpendByClientMonth([]).size).toBe(0);
  });
});

describe("adSpendTotalCents", () => {
  it("sums every row", () => {
    expect(adSpendTotalCents(rows)).toBe(1_399_999);
    expect(adSpendTotalCents([])).toBe(0);
  });
});

describe("basisAfterAdSpend", () => {
  it("subtracts ad spend from cash after fees", () => {
    expect(basisAfterAdSpend(1_000_000, 350_000)).toBe(650_000);
  });

  it("never goes below zero — a month can't owe negative rev-share", () => {
    expect(basisAfterAdSpend(200_000, 500_000)).toBe(0);
  });

  it("is unchanged when there is no ad spend", () => {
    expect(basisAfterAdSpend(1_000_000, 0)).toBe(1_000_000);
  });
});
