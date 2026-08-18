import { describe, expect, it } from "vitest";

import { cents } from "@/lib/money";
import {
  processorFee,
  isKnownProcessor,
  FANBASIS_BPS,
  FANBASIS_FLAT_CENTS,
} from "@/lib/accounting/fees";

describe("processorFee — Fanbasis", () => {
  it("is 2.9% plus a flat $0.29 per transaction", () => {
    // $1,400.00: percentage part $40.60, plus $0.29 = $40.89.
    expect(processorFee(cents(140_000), "fanbasis")).toBe(4089);
  });

  it("reproduces every verified real Fanbasis fee", () => {
    // cash -> fee, backed out from the five payouts verified against Fanbasis.
    const verified: Array<[number, number]> = [
      [140_000, 4089], // $1,400 -> $40.89
      [500_000, 14_529], // $5,000 -> $145.29
      [200_000, 5829], // $2,000 -> $58.29
      [100_000, 2929], // $1,000 -> $29.29
      [150_000, 4379], // $1,500 -> $43.79
    ];
    for (const [cash, fee] of verified) {
      expect(processorFee(cents(cash), "fanbasis")).toBe(fee);
    }
  });

  it("still charges the flat component on a zero amount", () => {
    expect(processorFee(cents(0), "fanbasis")).toBe(FANBASIS_FLAT_CENTS);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(processorFee(cents(140_000), "  Fanbasis ")).toBe(4089);
    expect(processorFee(cents(140_000), "FANBASIS")).toBe(4089);
  });

  it("exposes its constants", () => {
    expect(FANBASIS_BPS).toBe(290);
    expect(FANBASIS_FLAT_CENTS).toBe(29);
  });
});

describe("processorFee — free bank rails", () => {
  it.each(["wire", "ach", "zelle", "ACH", " Zelle "])(
    "charges nothing on %s",
    (rail) => {
      expect(processorFee(cents(500_000), rail)).toBe(0);
    },
  );
});

describe("processorFee — unknown processors fail loud", () => {
  it("throws rather than silently returning zero", () => {
    expect(() => processorFee(cents(100_000), "stripe")).toThrow(/Unknown processor/);
  });
});

describe("isKnownProcessor", () => {
  it("recognises the modelled rails and nothing else", () => {
    expect(isKnownProcessor("fanbasis")).toBe(true);
    expect(isKnownProcessor("wire")).toBe(true);
    expect(isKnownProcessor("ach")).toBe(true);
    expect(isKnownProcessor("zelle")).toBe(true);
    expect(isKnownProcessor("stripe")).toBe(false);
    expect(isKnownProcessor("")).toBe(false);
  });
});
