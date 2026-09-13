import { describe, expect, it } from "vitest";

import {
  canonicalMethod,
  isPricedMethod,
  methodsByKind,
  PAYMENT_METHODS,
} from "@/lib/accounting/payment-methods";
import {
  computeDeal,
  sheetFeeCents,
  SHEET_FEE_RATES_BPS,
  type MirrorDealInput,
} from "@/lib/accounting/sheet-mirror";
import {
  PROVIDERS,
  PROVIDER_VALUES,
  providerByValue,
  providerSyncStatus,
} from "@/lib/integrations/providers";
import { normalizePayment } from "@/lib/payments/normalize";
import { PAYMENT_METHODS as ENGINE_PAYMENT_METHODS } from "@/lib/transactions/engine";
import { FACT_SOURCES, processorMatchesSource } from "@/lib/tracking/sources";

/**
 * Commas is the ONE payment processor. Fanbasis is its retired name — same
 * company, same rail. This suite is the guard that the two never fork into two
 * processors, two fees, or two counts, while any legacy "Fanbasis" input still
 * resolves to Commas.
 */
describe("Commas is canonical; Fanbasis is a recognized input alias for the SAME processor", () => {
  it("charges the identical fee whether a payment is recorded as Fanbasis or Commas", () => {
    // Same rate constant.
    expect(SHEET_FEE_RATES_BPS.Commas).toBe(SHEET_FEE_RATES_BPS.Fanbasis);
    // Same computed fee, across cash amounts, INCLUDING the flat $0.29 when cash moved.
    for (const cash of [0, 100_000, 200_000, 500_000, 1_337_42]) {
      expect(sheetFeeCents(cash, "Commas", null)).toBe(
        sheetFeeCents(cash, "Fanbasis", null),
      );
    }
    // The real 2.9% + $0.29 shape is unchanged: $5,000 → $145.29.
    expect(sheetFeeCents(500_000, "Commas", null)).toBe(14_529);
    expect(sheetFeeCents(500_000, "Fanbasis", null)).toBe(14_529);
    // No cash moved → no flat fee, under either name.
    expect(sheetFeeCents(0, "Commas", null)).toBe(0);
    expect(sheetFeeCents(0, "Fanbasis", null)).toBe(0);
  });

  it("resolves both names to the one canonical processor method, so they never fork", () => {
    expect(canonicalMethod("Commas")).toBe("Commas");
    expect(canonicalMethod("commas")).toBe("Commas");
    expect(canonicalMethod("Fanbasis")).toBe("Commas");
    expect(canonicalMethod("  fanbasis  ")).toBe("Commas");
    // Both are priced (never fall to the 3% catch-all).
    expect(isPricedMethod("Commas")).toBe(true);
    expect(isPricedMethod("Fanbasis")).toBe(true);
  });

  it("computes an identical deal (fee, net, split) under either name — one processor, one count", () => {
    const base: Omit<MirrorDealInput, "method"> = {
      rowIndex: 2,
      timestamp: "",
      dateClosed: "2026-09-01",
      client: "Example",
      dealType: "Rev-Share",
      offer: "",
      revenueCents: 500_000,
      cashCents: 500_000,
      pctEntered: 30,
      feeOverrideCents: null,
      agreement: "",
      notes: "",
      payoutStatus: "",
    };
    const asCommas = computeDeal({ ...base, method: "Commas" });
    const asFanbasis = computeDeal({ ...base, method: "Fanbasis" });
    expect(asCommas).toEqual(asFanbasis);
  });

  it("routes both provider webhooks to the same normalizer — a real charge, not double capture", () => {
    const commas = normalizePayment("commas", { id: "x1", amount: 10 });
    const fanbasis = normalizePayment("fanbasis", { id: "x1", amount: 10 });
    // Same shape, and crucially the SAME external id → the capture table's
    // idempotency key dedupes them to one event even if both strings arrive.
    expect(commas).toMatchObject({
      kind: "charge",
      amountCents: 1000,
      externalId: "x1",
    });
    expect(fanbasis).toMatchObject({
      kind: "charge",
      amountCents: 1000,
      externalId: "x1",
    });
    expect(commas?.externalId).toBe(fanbasis?.externalId);
  });

  it("attributes a sheet Processor cell of either spelling to the single Commas source", () => {
    // Exactly one processor-of-this-rail source exists; there is no separate
    // "fanbasis" source that could double-count against "commas".
    expect(FACT_SOURCES).toContain("commas");
    expect(FACT_SOURCES).not.toContain("fanbasis");
    expect(processorMatchesSource("Commas", "commas")).toBe(true);
    expect(processorMatchesSource("Fanbasis", "commas")).toBe(true);
  });

  it("no longer OFFERS Fanbasis anywhere a user picks a processor", () => {
    // Integration catalog: Commas is offered, Fanbasis is gone.
    expect(PROVIDER_VALUES).toContain("commas");
    expect(PROVIDER_VALUES).not.toContain("fanbasis");
    expect(providerByValue("fanbasis")).toBeUndefined();
    expect(PROVIDERS.some((p) => p.label === "Fanbasis")).toBe(false);
    expect(providerSyncStatus("commas")).toBe("webhook");

    // Deal-form payment methods (accounting): Commas offered, Fanbasis not.
    expect(PAYMENT_METHODS.some((m) => m.name === "Commas")).toBe(true);
    expect(PAYMENT_METHODS.some((m) => m.name === "Fanbasis")).toBe(false);
    const offered = methodsByKind().flatMap((g) => g.methods.map((m) => m.name));
    expect(offered).toContain("Commas");
    expect(offered).not.toContain("Fanbasis");

    // v2 transaction engine catalog: same.
    expect(ENGINE_PAYMENT_METHODS).toContain("Commas");
    expect(ENGINE_PAYMENT_METHODS).not.toContain("Fanbasis");
  });
});
