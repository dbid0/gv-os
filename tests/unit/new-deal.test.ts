import { describe, expect, it } from "vitest";

import {
  newDealIdempotencyKey,
  newDealToTransaction,
  parseMoneyCents,
  toDayKey,
  type NewDealRow,
} from "@/lib/sheets/new-deal";

const base: NewDealRow = {
  timestamp: "2026-08-20T14:03:11Z",
  dealDate: "2026-08-20",
  clientName: "Jane Doe",
  closerName: "Aiden",
  setterName: "Mia",
  typeOfSale: "PIF",
  programSold: "Operation Room",
  status: "Closed",
  cashCollected: "$5,000.00",
  revenueGenerated: "$10,000",
  balanceDue: "$5,000",
  ar: "Yes",
  processor: "Stripe",
  processorFeePct: "2.9",
  closerPct: "20",
  setterPct: "10",
};

const opts = { clientId: "client-1", sheetId: "sheetA", offer: "The Grid" };

describe("parseMoneyCents", () => {
  it("parses dollars, commas, and symbols to integer cents", () => {
    expect(parseMoneyCents("$5,000.00")).toBe(500_000);
    expect(parseMoneyCents("5000")).toBe(500_000);
    expect(parseMoneyCents("1234.5")).toBe(123_450);
    expect(parseMoneyCents("")).toBe(0);
  });
  it("refuses garbage and over-precise input", () => {
    expect(parseMoneyCents("abc")).toBeNull();
    expect(parseMoneyCents("10.999")).toBeNull();
  });
});

describe("newDealIdempotencyKey", () => {
  it("keys by sheet + row timestamp, never colliding with processor keys", () => {
    expect(newDealIdempotencyKey("sheetA", "2026-08-20T14:03:11Z")).toBe(
      "offer-deal:sheetA:2026-08-20T14:03:11Z",
    );
  });
});

describe("newDealToTransaction", () => {
  it("maps a clean row to a client-layer in-row with fee + meta", () => {
    const out = newDealToTransaction(base, opts);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.row).toMatchObject({
      occurredOn: "2026-08-20",
      direction: "in",
      layer: "client",
      clientId: "client-1",
      dealType: "PIF",
      offer: "The Grid",
      description: "Jane Doe — Operation Room",
      paymentMethod: "Stripe",
      revenueCents: 1_000_000,
      cashCents: 500_000,
      processorFeeCents: 14_500, // 2.9% of $5,000
      source: "sheet",
      idempotencyKey: "offer-deal:sheetA:2026-08-20T14:03:11Z",
    });
    expect(out.row.meta).toEqual({
      customerName: "Jane Doe",
      closerName: "Aiden",
      setterName: "Mia",
      closerBps: 2000,
      setterBps: 1000,
      balanceCents: 500_000,
      isAr: true,
      status: "Closed",
    });
  });

  it("defaults type, offer-less description, and blank fee/balance", () => {
    const out = newDealToTransaction(
      {
        ...base,
        typeOfSale: "",
        programSold: "",
        clientName: "Solo",
        balanceDue: "",
        processorFeePct: "",
        ar: "no",
        status: "",
      },
      opts,
    );
    if (!out.ok) throw new Error("unreachable");
    expect(out.row.dealType).toBe("New Deal");
    expect(out.row.description).toBe("Solo");
    expect(out.row.processorFeeCents).toBe(0);
    expect(out.row.meta).toMatchObject({
      balanceCents: 0,
      isAr: false,
      status: "closed",
    });
  });

  it("refuses unreadable cash / revenue / fee", () => {
    expect(newDealToTransaction({ ...base, cashCollected: "lots" }, opts).ok).toBe(
      false,
    );
    expect(newDealToTransaction({ ...base, revenueGenerated: "?" }, opts).ok).toBe(
      false,
    );
    expect(newDealToTransaction({ ...base, processorFeePct: "abc" }, opts).ok).toBe(
      false,
    );
  });

  it("refuses negatives, a fee above cash, and missing keys/dates", () => {
    expect(newDealToTransaction({ ...base, cashCollected: "-5" }, opts).ok).toBe(false);
    expect(newDealToTransaction({ ...base, processorFeePct: "200" }, opts).ok).toBe(
      false,
    );
    expect(newDealToTransaction({ ...base, timestamp: "  " }, opts).ok).toBe(false);
    expect(newDealToTransaction({ ...base, dealDate: "" }, opts).ok).toBe(false);
  });

  it("returns the reason on refusal", () => {
    const out = newDealToTransaction({ ...base, cashCollected: "x" }, opts);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.reason).toContain("cash collected");
  });
});

import { parseNewDealsSheet } from "@/lib/sheets/new-deal";

describe("parseNewDealsSheet", () => {
  const header = [
    "Timestamp",
    "Deal Date",
    "Client Name",
    "Closer Name",
    "Setter Name",
    "Type of Sale",
    "Program Sold",
    "Status",
    "Cash Collected",
    "Revenue Generated",
    "Balance Due",
    "AR?",
    "Processor",
    "Processor Fee %",
  ];

  it("keys rows by header, trims, and drops blank-timestamp rows", () => {
    const rows = parseNewDealsSheet([
      header,
      [
        "2026-08-20T10:00:00Z",
        "2026-08-20",
        " Jane ",
        "Aiden",
        "Mia",
        "PIF",
        "Operation Room",
        "Closed",
        "5000",
        "10000",
        "5000",
        "Yes",
        "Stripe",
        "2.9",
      ],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", ""], // trailing blank
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      timestamp: "2026-08-20T10:00:00Z",
      clientName: "Jane",
      closerName: "Aiden",
      cashCollected: "5000",
      processorFeePct: "2.9",
    });
  });

  it("is robust to reordered and extra columns", () => {
    const rows = parseNewDealsSheet([
      ["Extra", "Cash Collected", "Timestamp", "Deal Date", "Notes col"],
      ["x", "$1,000", "2026-08-21T09:00:00Z", "2026-08-21", "whatever"],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].cashCollected).toBe("$1,000");
    expect(rows[0].dealDate).toBe("2026-08-21");
    expect(rows[0].clientName).toBe("");
  });

  it("returns [] for an empty or header-only sheet", () => {
    expect(parseNewDealsSheet([])).toEqual([]);
    expect(parseNewDealsSheet([header])).toEqual([]);
  });
});

describe("toDayKey", () => {
  it("extracts yyyy-mm-dd from a date or datetime, else null", () => {
    expect(toDayKey("2026-08-03")).toBe("2026-08-03");
    expect(toDayKey("2026-08-03 16:53:39")).toBe("2026-08-03");
    expect(toDayKey("  2026-08-03T10:00:00Z ")).toBe("2026-08-03");
    expect(toDayKey("Aug 3 2026")).toBeNull();
    expect(toDayKey("")).toBeNull();
  });
});

describe("newDealToTransaction — datetime deal date", () => {
  it("normalizes a datetime deal date to its day key", () => {
    const out = newDealToTransaction(
      { ...base, dealDate: "2026-08-03 16:53:39" },
      opts,
    );
    if (!out.ok) throw new Error("unreachable");
    expect(out.row.occurredOn).toBe("2026-08-03");
  });
});
