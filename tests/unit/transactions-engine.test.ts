import { describe, expect, it } from "vitest";

import type { MirrorDealInput, MirrorComputed } from "@/lib/accounting/sheet-mirror";
import {
  autoProcessorFeeCents,
  buildSheetImport,
  DEAL_TYPES,
  PAYMENT_METHODS,
  sheetDealToTransaction,
  sheetIdempotencyKey,
  type SheetDealRow,
} from "@/lib/transactions/engine";

function input(overrides: Partial<MirrorDealInput> = {}): MirrorDealInput {
  return {
    rowIndex: 2,
    timestamp: "2026-08-06 10:00:00",
    dateClosed: "2026-08-06",
    client: "Kaden (AI)",
    dealType: "Setup",
    offer: "The Grid",
    revenueCents: 500_000,
    cashCents: 500_000,
    method: "Fanbasis",
    pctEntered: null,
    feeOverrideCents: null,
    agreement: "Yes",
    notes: "",
    payoutStatus: "Pending",
    ...overrides,
  };
}

const OURS: MirrorComputed = {
  arCents: 0,
  feeCents: 14_529,
  netCents: 485_471,
  danielCents: 242_736,
  gusCents: 242_735,
};

const DEAL: SheetDealRow = { input: input(), ours: OURS };

describe("autoProcessorFeeCents", () => {
  it("is the proven sheet formula, override wins", () => {
    // Fanbasis: 2.9% + 29¢ flat on non-zero cash.
    expect(autoProcessorFeeCents(500_000, "Fanbasis")).toBe(14_529);
    expect(autoProcessorFeeCents(500_000, "Wire")).toBe(0);
    expect(autoProcessorFeeCents(500_000, "ACH")).toBe(0);
    expect(autoProcessorFeeCents(500_000, "Fanbasis", 10_000)).toBe(10_000);
    expect(autoProcessorFeeCents(0, "Fanbasis")).toBe(0);
  });
});

describe("sheetIdempotencyKey", () => {
  it("is content-keyed and case/whitespace-stable — never the row index", () => {
    const a = sheetIdempotencyKey(input(), 0);
    const b = sheetIdempotencyKey(input({ rowIndex: 99 }), 0);
    const c = sheetIdempotencyKey(input({ client: "  KADEN (ai) " }), 0);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(sheetIdempotencyKey(input({ cashCents: 1 }), 0)).not.toBe(a);
    expect(sheetIdempotencyKey(input(), 1)).not.toBe(a);
  });
});

describe("sheetDealToTransaction", () => {
  it("maps a sheet deal to an agency money-in row using OUR fee recompute", () => {
    const row = sheetDealToTransaction(DEAL, 0);
    expect(row).toEqual({
      occurredOn: "2026-08-06",
      direction: "in",
      layer: "agency",
      dealType: "Setup",
      description: "Kaden (AI)",
      paymentMethod: "Fanbasis",
      revenueCents: 500_000,
      cashCents: 500_000,
      processorFeeCents: 14_529,
      source: "sheet",
      idempotencyKey: sheetIdempotencyKey(input(), 0),
      notes: null,
    });
  });

  it("keeps real notes and drops blank ones", () => {
    const withNotes = sheetDealToTransaction(
      { input: input({ notes: "  paid in two parts " }), ours: OURS },
      0,
    );
    expect(withNotes.notes).toBe("paid in two parts");
  });
});

describe("buildSheetImport", () => {
  it("gives identical rows stable occurrence counters, order-independent", () => {
    const twin = { input: input(), ours: OURS };
    const rows = buildSheetImport([DEAL, twin]);
    expect(rows[0].idempotencyKey).toBe(sheetIdempotencyKey(input(), 0));
    expect(rows[1].idempotencyKey).toBe(sheetIdempotencyKey(input(), 1));
    // Different content doesn't consume the twin counter.
    const other = { input: input({ cashCents: 1 }), ours: OURS };
    const mixed = buildSheetImport([DEAL, other, twin]);
    expect(mixed[2].idempotencyKey).toBe(sheetIdempotencyKey(input(), 1));
  });

  it("empty sheet imports nothing", () => {
    expect(buildSheetImport([])).toEqual([]);
  });
});

describe("catalog constants", () => {
  it("carry the spec's deal types and payment methods", () => {
    expect(DEAL_TYPES).toContain("Rev-Share");
    expect(DEAL_TYPES).toContain("Client Handoff");
    expect(PAYMENT_METHODS).toContain("Fanbasis");
    expect(PAYMENT_METHODS).toContain("Wire");
  });
});
