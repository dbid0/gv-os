import { describe, expect, it } from "vitest";

import { type RevShareLine } from "@/lib/revshare/engine";
import {
  buildRevShareStatement,
  formatMonth,
  type StatementRow,
} from "@/lib/revshare/statement";

describe("formatMonth", () => {
  it("renders a yyyy-mm key as a full month", () => {
    expect(formatMonth("2026-08")).toBe("August 2026");
    expect(formatMonth("2026-01")).toBe("January 2026");
    expect(formatMonth("nope")).toBe("nope");
  });
});

describe("buildRevShareStatement", () => {
  const line: RevShareLine = {
    clientId: "grid",
    month: "2026-08",
    cashAfterFeesCents: 970_000,
    adSpendCents: 0,
    basisCents: 970_000,
    rateBps: 2000,
    revShareCents: 194_000,
  };
  const rows: StatementRow[] = [
    // The Grid, August, client-layer income — counted.
    {
      clientId: "grid",
      layer: "client",
      direction: "in",
      occurredOn: "2026-08-03",
      cashCents: 500_000,
      processorFeeCents: 15_000,
    },
    {
      clientId: "grid",
      layer: "client",
      direction: "in",
      occurredOn: "2026-08-20",
      cashCents: 500_000,
      processorFeeCents: 15_000,
    },
    // Wrong month — excluded.
    {
      clientId: "grid",
      layer: "client",
      direction: "in",
      occurredOn: "2026-07-30",
      cashCents: 999_999,
      processorFeeCents: 0,
    },
    // Another client — excluded.
    {
      clientId: "vault",
      layer: "client",
      direction: "in",
      occurredOn: "2026-08-05",
      cashCents: 999_999,
      processorFeeCents: 0,
    },
    // Agency layer — excluded (rev-share is client-side only).
    {
      clientId: "grid",
      layer: "agency",
      direction: "in",
      occurredOn: "2026-08-06",
      cashCents: 999_999,
      processorFeeCents: 0,
    },
  ];

  it("derives gross, fees, and deal count from this client-month only", () => {
    const s = buildRevShareStatement(rows, line, "The Grid");
    expect(s.grossCashCents).toBe(1_000_000);
    expect(s.processorFeeCents).toBe(30_000);
    expect(s.dealCount).toBe(2);
    expect(s.clientName).toBe("The Grid");
  });

  it("takes after-fees and share straight from the engine line, never recomputes", () => {
    const s = buildRevShareStatement(rows, line, "The Grid");
    expect(s.cashAfterFeesCents).toBe(970_000);
    expect(s.rateBps).toBe(2000);
    expect(s.revShareCents).toBe(194_000);
    // Gross minus fees reconciles with the engine's after-fees figure.
    expect(s.grossCashCents - s.processorFeeCents).toBe(s.cashAfterFeesCents);
  });
});
