import { describe, expect, it } from "vitest";

import {
  rateBpsFor,
  revShareLines,
  type ClientCashRow,
  type RevShareRuleInput,
} from "@/lib/revshare/engine";

const GRID = "grid-id";
const VAULT = "vault-id";

const RULES: RevShareRuleInput[] = [
  { clientId: GRID, rateBps: 2000, effectiveFrom: "2026-07-14" },
  { clientId: VAULT, rateBps: 1500, effectiveFrom: "2026-07-03" },
  // A raise for Grid later — effective-dating must pick per day.
  { clientId: GRID, rateBps: 2500, effectiveFrom: "2026-09-01" },
];

const row = (o: Partial<ClientCashRow>): ClientCashRow => ({
  clientId: GRID,
  direction: "in",
  layer: "client",
  occurredOn: "2026-08-10",
  cashCents: 100_000,
  processorFeeCents: 0,
  ...o,
});

describe("rateBpsFor", () => {
  it("picks the newest rule effective on or before the day", () => {
    expect(rateBpsFor(RULES, GRID, "2026-08-10")).toBe(2000);
    expect(rateBpsFor(RULES, GRID, "2026-09-01")).toBe(2500);
    expect(rateBpsFor(RULES, GRID, "2026-07-13")).toBeNull();
    expect(rateBpsFor(RULES, VAULT, "2026-08-01")).toBe(1500);
    expect(rateBpsFor(RULES, "unknown", "2026-08-01")).toBeNull();
  });
});

describe("revShareLines", () => {
  it("computes after-fees × rate, bucketed by client-month, newest first", () => {
    const lines = revShareLines(
      [
        row({ cashCents: 500_000, processorFeeCents: 14_529 }),
        row({ cashCents: 100_000, occurredOn: "2026-08-20" }),
        row({ clientId: VAULT, cashCents: 200_000, occurredOn: "2026-07-15" }),
      ],
      RULES,
    );
    const gridAug = lines.find((l) => l.clientId === GRID && l.month === "2026-08");
    // (500000-14529)*20% = 97094.2 → 97094 ; 100000*20% = 20000.
    expect(gridAug).toMatchObject({
      cashAfterFeesCents: 585_471,
      rateBps: 2000,
      revShareCents: 117_094,
    });
    const vaultJul = lines.find((l) => l.clientId === VAULT);
    expect(vaultJul).toMatchObject({ month: "2026-07", revShareCents: 30_000 });
    expect(lines[0].month >= lines[lines.length - 1].month).toBe(true);
  });

  it("rates each row by its own day across a rate change", () => {
    const lines = revShareLines(
      [
        row({ cashCents: 100_000, occurredOn: "2026-08-31" }),
        row({ cashCents: 100_000, occurredOn: "2026-09-01" }),
      ],
      RULES,
    );
    expect(lines.find((l) => l.month === "2026-08")?.revShareCents).toBe(20_000);
    expect(lines.find((l) => l.month === "2026-09")?.revShareCents).toBe(25_000);
  });

  it("skips agency rows, out-rows, unattributed rows, and unruled clients", () => {
    const lines = revShareLines(
      [
        row({ layer: "agency", cashCents: 999_999 }),
        row({ direction: "out", cashCents: 999_999 }),
        row({ clientId: null, cashCents: 999_999 }),
        row({ clientId: "no-rule-client", cashCents: 999_999 }),
      ],
      RULES,
    );
    expect(lines).toEqual([]);
  });
});
