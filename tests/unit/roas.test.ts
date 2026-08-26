import { describe, expect, it } from "vitest";

import { adRoas } from "@/lib/ads/roas";

describe("adRoas", () => {
  it("computes ROAS, CAC, and profit from spend and returns", () => {
    const r = adRoas({
      spendCents: 1_000_000, // $10k spend
      cashCents: 4_000_000, // $40k collected
      deals: 8,
      applications: 200,
    });
    expect(r.roas).toBe(4); // 4x
    expect(r.cacPerDealCents).toBe(125_000); // $1,250 / deal
    expect(r.cacPerAppCents).toBe(5_000); // $50 / application
    expect(r.profitCents).toBe(3_000_000);
  });

  it("rounds ROAS to two decimals", () => {
    expect(
      adRoas({ spendCents: 300, cashCents: 1_000, deals: 0, applications: 0 }).roas,
    ).toBe(3.33);
  });

  it("returns null CAC when there are no deals or apps", () => {
    const r = adRoas({ spendCents: 500_000, cashCents: 0, deals: 0, applications: 0 });
    expect(r.cacPerDealCents).toBeNull();
    expect(r.cacPerAppCents).toBeNull();
    expect(r.profitCents).toBe(-500_000); // spend with nothing back
  });

  it("reports zero ROAS with no spend (never divides by zero)", () => {
    const r = adRoas({ spendCents: 0, cashCents: 500_000, deals: 2, applications: 10 });
    expect(r.roas).toBe(0);
    expect(r.cacPerDealCents).toBe(0);
  });
});
