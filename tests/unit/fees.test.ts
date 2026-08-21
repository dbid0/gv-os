import { describe, expect, it } from "vitest";

import { processorFee } from "@/lib/fees";
import { cents } from "@/lib/money";

describe("processorFee", () => {
  it("is zero when there is no fee config", () => {
    expect(processorFee(cents(10_000), null, null)).toBe(0);
  });

  it("applies percentage + flat (Fanbasis 2.9% + $0.30 on $100)", () => {
    // 2.9% of 10_000c = 290c, + 30c flat = 320c
    expect(processorFee(cents(10_000), 290, 30)).toBe(320);
  });

  it("applies a flat-only fee", () => {
    expect(processorFee(cents(10_000), null, 30)).toBe(30);
  });

  it("applies a percentage-only fee", () => {
    expect(processorFee(cents(10_000), 290, null)).toBe(290);
  });

  it("never exceeds the cash it is taken from", () => {
    expect(processorFee(cents(10), 5000, 100)).toBe(10);
  });

  it("is zero on zero or negative cash", () => {
    expect(processorFee(cents(0), 290, 30)).toBe(0);
    expect(processorFee(cents(-500), 290, 30)).toBe(0);
  });

  it("is zero when the computed fee is not positive", () => {
    expect(processorFee(cents(10_000), 0, 0)).toBe(0);
  });
});
