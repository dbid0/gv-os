import { describe, expect, it } from "vitest";

import {
  mapRawRow,
  rowFromCells,
  isBlankRow,
  RAW_DATA_COLUMN_COUNT,
  type RawDataRow,
} from "@/lib/accounting/sheet-import";

// Synthetic rows only — no real client names or figures live in the repo.
function row(partial: Partial<RawDataRow>): RawDataRow {
  return {
    timestamp: "2026-01-01 10:00:00",
    dateClosed: "2026-01-01",
    clientBrand: "Test Brand",
    dealType: "Setup",
    offer: "A package",
    revenue: "1000",
    cashCollected: "1000",
    paymentMethod: "Wire",
    danielPercent: "",
    processorFeeOverride: "",
    agreementSigned: "Yes",
    notes: "",
    payoutStatus: "Paid Out",
    ...partial,
  };
}

describe("rowFromCells", () => {
  it("maps a full cell array by position", () => {
    const cells = [
      "2026-01-01 10:00",
      "2026-01-01",
      "Brand",
      "Setup",
      "Pkg",
      "1000",
      "1000",
      "Wire",
      "45",
      "12.34",
      "Yes",
      "note",
      "Paid Out",
    ];
    expect(cells.length).toBe(RAW_DATA_COLUMN_COUNT);
    const r = rowFromCells(cells);
    expect(r.clientBrand).toBe("Brand");
    expect(r.danielPercent).toBe("45");
    expect(r.processorFeeOverride).toBe("12.34");
    expect(r.payoutStatus).toBe("Paid Out");
  });

  it("tolerates a short row (trailing empties) and non-string cells", () => {
    const r = rowFromCells(["2026-01-01", "", "Brand", "Setup", "", 1000]);
    expect(r.revenue).toBe("1000"); // coerced from number
    expect(r.paymentMethod).toBe(""); // missing tail
    expect(r.notes).toBe("");
  });
});

describe("isBlankRow", () => {
  it("is true only when both timestamp and client are empty", () => {
    expect(isBlankRow(row({ timestamp: "", clientBrand: "" }))).toBe(true);
    expect(isBlankRow(row({ timestamp: "", clientBrand: "Brand" }))).toBe(false);
    expect(isBlankRow(row({}))).toBe(false);
  });
});

describe("mapRawRow — the split", () => {
  it("stores a historical override (30%) as basis points", () => {
    const r = mapRawRow(row({ dealType: "Rev-Share", danielPercent: "30" }));
    expect(r.deal.danielBps).toBe(3000);
  });

  it("stores null for a standing 50/50 (explicit or blank)", () => {
    expect(mapRawRow(row({ danielPercent: "50" })).deal.danielBps).toBeNull();
    expect(mapRawRow(row({ danielPercent: "" })).deal.danielBps).toBeNull();
  });

  it("forces Client Handoff to 50/50 regardless of the entered percent", () => {
    const r = mapRawRow(row({ dealType: "Client Handoff", danielPercent: "30" }));
    expect(r.deal.danielBps).toBeNull();
  });

  it("rejects a percentage that is not a whole basis point", () => {
    expect(() => mapRawRow(row({ danielPercent: "33.333" }))).toThrow();
  });
});

describe("mapRawRow — the deal and its payment", () => {
  it("parses money as cents and builds a keyed payment event", () => {
    const r = mapRawRow(
      row({
        timestamp: "2026-05-01 09:00:00",
        revenue: "3000",
        cashCollected: "3000",
        paymentMethod: "Fanbasis",
        processorFeeOverride: "24.29",
      }),
    );
    expect(r.deal.externalRef).toBe("sheet:2026-05-01 09:00:00");
    expect(r.deal.contractValueCents).toBe(300_000);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      externalRef: "sheet:2026-05-01 09:00:00:payment",
      eventType: "payment_received",
      amountCents: 300_000,
      processor: "fanbasis",
      feeOverrideCents: 2429,
    });
  });

  it("leaves the fee override null when column J is blank", () => {
    const r = mapRawRow(row({ paymentMethod: "Wire", processorFeeOverride: "" }));
    expect(r.events[0].feeOverrideCents).toBeNull();
  });

  it("emits no payment event when no cash was collected", () => {
    expect(mapRawRow(row({ cashCollected: "" })).events).toHaveLength(0);
    expect(mapRawRow(row({ cashCollected: "0" })).events).toHaveLength(0);
  });

  it("carries optional fields through, empties become null", () => {
    const full = mapRawRow(
      row({ offer: "Pkg", notes: "hi", agreementSigned: "Yes" }),
    ).deal;
    expect(full).toMatchObject({ offer: "Pkg", notes: "hi", agreementSigned: "Yes" });
    const bare = mapRawRow(row({ offer: "", notes: "", agreementSigned: "" })).deal;
    expect(bare.offer).toBeNull();
    expect(bare.notes).toBeNull();
    expect(bare.agreementSigned).toBeNull();
  });

  it("falls back to the timestamp when Date Closed is blank", () => {
    const r = mapRawRow(row({ timestamp: "2026-02-02 08:00:00", dateClosed: "" }));
    expect(r.deal.closedAt).toBe("2026-02-02 08:00:00");
  });

  it("throws on a row with no timestamp to key on", () => {
    expect(() => mapRawRow(row({ timestamp: "" }))).toThrow(/Timestamp/);
  });
});
