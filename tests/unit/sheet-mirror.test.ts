import { describe, expect, it } from "vitest";

import {
  centsFromSheetNumber,
  computeDeal,
  danielPctBps,
  isoDate,
  parseRawRow,
  parseSheetComputedRow,
  reconcileSheet,
  sheetFeeCents,
  type MirrorDealInput,
} from "@/lib/accounting/sheet-mirror";

// Anonymised fixtures. Names are fake; every arithmetic shape is real —
// the same amounts, methods, overrides, and split percentages that appear in
// the live sheet, so the engine is proven on the actual cases it must handle.

const base: MirrorDealInput = {
  rowIndex: 2,
  timestamp: "7/1/2026 16:06:48",
  dateClosed: "2026-07-01",
  client: "Client A",
  dealType: "Setup",
  offer: "Setup fee",
  revenueCents: 0,
  cashCents: 0,
  method: "Wire",
  pctEntered: 50,
  feeOverrideCents: null,
  agreement: "Yes",
  notes: "",
  payoutStatus: "Paid Out",
};

describe("centsFromSheetNumber", () => {
  it("survives float noise from the Sheets API", () => {
    expect(centsFromSheetNumber(2082.9970000000003)).toBe(208300);
    expect(centsFromSheetNumber(24.29)).toBe(2429);
    expect(centsFromSheetNumber(970.855)).toBe(97086);
    expect(centsFromSheetNumber(145.29)).toBe(14529);
  });

  it("treats blank as zero and rejects garbage", () => {
    expect(centsFromSheetNumber("")).toBe(0);
    expect(centsFromSheetNumber(null)).toBe(0);
    expect(centsFromSheetNumber(undefined)).toBe(0);
    expect(centsFromSheetNumber("3000")).toBe(300000);
    expect(() => centsFromSheetNumber("not-money")).toThrow(/finite/);
  });

  it("rounds negatives half away from zero", () => {
    // 0.125 is exact in binary: -12.5 cents must round to -13, not -12
    // (Math.round alone would give -12 — it rounds halves toward +∞).
    expect(centsFromSheetNumber(-0.125)).toBe(-13);
    expect(centsFromSheetNumber(0.125)).toBe(13);
  });
});

describe("sheetFeeCents — the live formula, verbatim", () => {
  it("applies Fanbasis 2.9% + $0.29 (the $5,000 → $145.29 case)", () => {
    expect(sheetFeeCents(500_000, "Fanbasis", null)).toBe(14529);
    expect(sheetFeeCents(200_000, "Fanbasis", null)).toBe(5829);
    expect(sheetFeeCents(140_000, "Fanbasis", null)).toBe(4089);
  });

  it("skips the Fanbasis flat when no cash moved", () => {
    expect(sheetFeeCents(0, "Fanbasis", null)).toBe(0);
  });

  it("charges zero on the free rails", () => {
    for (const m of ["Wire", "ACH", "Zelle", "Wise", "Check / Cash"]) {
      expect(sheetFeeCents(1_000_000, m, null)).toBe(0);
    }
  });

  it("uses each listed rate and the 3% fallback for unknown methods", () => {
    expect(sheetFeeCents(100_000, "Whop", null)).toBe(4510);
    expect(sheetFeeCents(100_000, "PayPal", null)).toBe(3490);
    expect(sheetFeeCents(100_000, "Venmo", null)).toBe(1900);
    expect(sheetFeeCents(100_000, "Cash App", null)).toBe(2750);
    expect(sheetFeeCents(100_000, "Crypto", null)).toBe(1500);
    expect(sheetFeeCents(100_000, "Payva", null)).toBe(8000);
    expect(sheetFeeCents(100_000, "Stripe", null)).toBe(2900);
    expect(sheetFeeCents(100_000, "CarrierPigeon", null)).toBe(3000);
  });

  it("an override wins over the formula, including an explicit zero", () => {
    expect(sheetFeeCents(300_000, "Fanbasis", 2429)).toBe(2429);
    expect(sheetFeeCents(200_000, "Zelle", 0)).toBe(0);
    expect(sheetFeeCents(200_000, "ACH", 200)).toBe(200);
  });
});

describe("danielPctBps", () => {
  it("Client Handoff is always 50% regardless of the entered value", () => {
    expect(danielPctBps("Client Handoff", 30)).toBe(5000);
    expect(danielPctBps("Client Handoff", null)).toBe(5000);
  });

  it("blank defaults to 50%, otherwise the entered percent", () => {
    expect(danielPctBps("Setup", null)).toBe(5000);
    expect(danielPctBps("Setup", 30)).toBe(3000);
    expect(danielPctBps("Rev-Share", 45)).toBe(4500);
    expect(danielPctBps("DFY Build", 40)).toBe(4000);
  });
});

describe("computeDeal — the full chain", () => {
  it("reproduces a 30% Fanbasis deal with an override to the cent", () => {
    const out = computeDeal({
      ...base,
      dealType: "Rev-Share",
      revenueCents: 300_000,
      cashCents: 300_000,
      method: "Fanbasis",
      pctEntered: 30,
      feeOverrideCents: 2429,
    });
    expect(out).toEqual({
      arCents: 0,
      feeCents: 2429,
      netCents: 297_571,
      danielCents: 89_271,
      gusCents: 208_300,
    });
    expect(out.danielCents + out.gusCents).toBe(out.netCents);
  });

  it("resolves the sheet's unpayable half-cent 50/50 split as a residual", () => {
    // Cash $2,000 Fanbasis → fee $58.29 → net $1,941.71 → sheet says
    // 970.855 / 970.855. Rounding both up would overpay one cent.
    const out = computeDeal({
      ...base,
      revenueCents: 750_000,
      cashCents: 200_000,
      method: "Fanbasis",
      pctEntered: 50,
    });
    expect(out.feeCents).toBe(5829);
    expect(out.netCents).toBe(194_171);
    expect(out.danielCents).toBe(97_086);
    expect(out.gusCents).toBe(97_085);
    expect(out.danielCents + out.gusCents).toBe(out.netCents);
    expect(out.arCents).toBe(550_000);
  });

  it("handles an installment row (zero revenue, cash collected)", () => {
    const out = computeDeal({
      ...base,
      revenueCents: 0,
      cashCents: 200_000,
      method: "ACH",
      pctEntered: 40,
      feeOverrideCents: 200,
    });
    expect(out.arCents).toBe(0);
    expect(out.netCents).toBe(199_800);
    expect(out.danielCents).toBe(79_920);
    expect(out.gusCents).toBe(119_880);
  });
});

describe("isoDate", () => {
  it("passes ISO through and converts US format", () => {
    expect(isoDate("2026-05-23")).toBe("2026-05-23");
    expect(isoDate("7/1/2026")).toBe("2026-07-01");
    expect(isoDate("8/16/2026 0:22:39")).toBe("2026-08-16");
  });

  it("returns unparseable input unchanged so it stays visible", () => {
    expect(isoDate("sometime in july")).toBe("sometime in july");
  });
});

describe("parseRawRow", () => {
  const row = [
    "8/3/2026 9:40:41",
    "8/3/2026",
    "Client B",
    "Rev-Share",
    "Monthly rev share",
    1400,
    1400,
    "Fanbasis",
    50,
    40.89,
    "Yes",
    "a note",
    "Paid Out",
  ];

  it("parses a full row with an override", () => {
    const input = parseRawRow(row, 17);
    expect(input).toMatchObject({
      rowIndex: 17,
      dateClosed: "2026-08-03",
      client: "Client B",
      revenueCents: 140_000,
      cashCents: 140_000,
      method: "Fanbasis",
      pctEntered: 50,
      feeOverrideCents: 4089,
    });
  });

  it("treats blank pct and blank fee as null", () => {
    const input = parseRawRow(
      [
        "2026-05-22",
        "2026-05-22",
        "Client C",
        "Setup",
        "x",
        10_000,
        10_000,
        "Wire",
        "",
        "",
        "Yes",
        "",
        "",
      ],
      3,
    );
    expect(input?.pctEntered).toBeNull();
    expect(input?.feeOverrideCents).toBeNull();
  });

  it("skips padding rows and keeps sparse ones", () => {
    expect(parseRawRow([], 50)).toBeNull();
    expect(parseRawRow(["", "", "", ""], 51)).toBeNull();
    expect(parseRawRow(["", "", "Client D"], 52)?.cashCents).toBe(0);
  });
});

describe("reconcileSheet — the drift report", () => {
  // Two rows in the shape the Sheets API returns them: raw inputs + the
  // sheet's own computed New Deals mirror (A–Q, floats).
  const raw = [
    [
      "2026-05-23",
      "2026-05-23",
      "Client A",
      "Rev-Share",
      "Setup + rev share",
      3000,
      3000,
      "Fanbasis",
      30,
      24.29,
      "Yes",
      "",
      "Paid Out",
    ],
    [
      "7/17/2026 15:15:58",
      "7/17/2026",
      "Client B",
      "Setup",
      "$7.5k setup",
      7500,
      2000,
      "Fanbasis",
      50,
      "",
      "Yes",
      "",
      "Paid Out",
    ],
  ];
  const computed = [
    [
      "5/23/2026 0:00",
      "5/23/2026",
      "Client A",
      "Rev-Share",
      "Setup + rev share",
      3000,
      3000,
      0,
      "Fanbasis",
      24.29,
      2975.71,
      0.3,
      892.713,
      2082.9970000000003,
      "Yes",
      "",
      "Paid Out",
    ],
    [
      "7/17/2026 15:15",
      "7/17/2026",
      "Client B",
      "Setup",
      "$7.5k setup",
      7500,
      2000,
      5500,
      "Fanbasis",
      58.29,
      1941.71,
      0.5,
      970.855,
      970.855,
      "Yes",
      "",
      "Paid Out",
    ],
  ];

  it("reconciles the clean row to zero and surfaces the half-cent row", () => {
    const report = reconcileSheet(raw, computed);
    expect(report.rowCount).toBe(2);

    // Row 1: sheet floats round to exactly our figures — zero drift.
    expect(report.deals[0].hasDrift).toBe(false);

    // Row 2: the sheet's 970.855/970.855 rounds to 97086/97086 (sum one cent
    // OVER net); ours is 97086/97085. Drift = −1 cent on Gus, honestly shown.
    expect(report.deals[1].hasDrift).toBe(true);
    expect(report.deals[1].driftCents.gusCents).toBe(-1);
    expect(report.deals[1].driftCents.danielCents).toBe(0);

    expect(report.driftRowCount).toBe(1);
    expect(report.totalAbsDriftCents).toBe(1);
    expect(report.totals.ours.netCents).toBe(297_571 + 194_171);
  });

  it("diffs a raw row with no computed twin against zeros, loudly", () => {
    const report = reconcileSheet(raw, [computed[0]]);
    expect(report.deals[1].hasDrift).toBe(true);
    expect(report.deals[1].driftCents.netCents).toBe(194_171);
  });

  it("keeps parseSheetComputedRow blank-safe", () => {
    const out = parseSheetComputedRow([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect(out.netCents).toBe(0);
  });
});
