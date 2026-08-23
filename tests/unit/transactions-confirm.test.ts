import { describe, expect, it } from "vitest";

import {
  paymentEventToTransaction,
  processorIdempotencyKey,
  type CapturedPaymentEvent,
} from "@/lib/transactions/confirm";

const CHARGE: CapturedPaymentEvent = {
  provider: "stripe",
  externalId: "ch_123",
  clientId: "client-1",
  kind: "charge",
  amountCents: 199_700,
  currency: "usd",
  email: "buyer@example.com",
  label: "Operation Room",
};

describe("processorIdempotencyKey", () => {
  it("is provider-qualified so ids can never collide across processors", () => {
    expect(processorIdempotencyKey(CHARGE)).toBe("processor:stripe:ch_123");
  });
});

describe("paymentEventToTransaction", () => {
  it("maps a client charge to an appendable in-row, cash = revenue", () => {
    const out = paymentEventToTransaction(CHARGE, "2026-08-23");
    expect(out).toEqual({
      ok: true,
      row: {
        occurredOn: "2026-08-23",
        direction: "in",
        layer: "client",
        clientId: "client-1",
        description: "Operation Room",
        paymentMethod: "stripe",
        revenueCents: 199_700,
        cashCents: 199_700,
        leadEmail: "buyer@example.com",
        source: "processor",
        idempotencyKey: "processor:stripe:ch_123",
      },
    });
  });

  it("maps a refund to an out-row with zero revenue", () => {
    const out = paymentEventToTransaction(
      { ...CHARGE, kind: "refund", clientId: null },
      "2026-08-23",
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.row.direction).toBe("out");
    expect(out.row.layer).toBe("agency");
    expect(out.row.revenueCents).toBe(0);
    expect(out.row.cashCents).toBe(199_700);
  });

  it("refuses non-USD instead of guessing an exchange rate", () => {
    const out = paymentEventToTransaction({ ...CHARGE, currency: "EUR" }, "2026-08-23");
    expect(out).toEqual({ ok: false, reason: "Unsupported currency EUR." });
  });

  it("refuses zero, negative, and fractional amounts", () => {
    for (const amountCents of [0, -500, 12.5]) {
      const out = paymentEventToTransaction({ ...CHARGE, amountCents }, "2026-08-23");
      expect(out.ok).toBe(false);
    }
  });

  it("refuses unknown kinds — ambiguity stays in the queue", () => {
    const out = paymentEventToTransaction({ ...CHARGE, kind: "unknown" }, "2026-08-23");
    expect(out).toEqual({ ok: false, reason: 'Unrecognized event kind "unknown".' });
  });

  it("accepts uppercase USD", () => {
    const out = paymentEventToTransaction({ ...CHARGE, currency: "USD" }, "2026-08-23");
    expect(out.ok).toBe(true);
  });
});
