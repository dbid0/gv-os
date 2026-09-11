import { describe, expect, it } from "vitest";

import {
  classifyRecovery,
  effectiveRecoveryStatus,
  isRecoveryDisposition,
  isStillRecoverable,
  isUnrecovered,
  recoverableTotalCents,
  type EffectiveRecoveryStatus,
  type FailedCharge,
  type SucceededCharge,
} from "@/lib/payments/recovery";
import { paymentEventToTransaction } from "@/lib/transactions/confirm";

const at = (iso: string) => new Date(iso);

const FAILED: FailedCharge = {
  customerRef: "cus_abc",
  email: "buyer@example.com",
  occurredAt: at("2026-09-01T00:00:00Z"),
};

describe("classifyRecovery — recovered vs lost", () => {
  it("is recovered when the same customer id later succeeds", () => {
    const succeeded: SucceededCharge[] = [
      { customerRef: "cus_abc", email: null, occurredAt: at("2026-09-05T00:00:00Z") },
    ];
    expect(classifyRecovery(FAILED, succeeded)).toBe("recovered");
  });

  it("is recovered when the same email later succeeds, case-insensitively", () => {
    const succeeded: SucceededCharge[] = [
      {
        customerRef: null,
        email: "BUYER@example.com",
        occurredAt: at("2026-09-02T00:00:00Z"),
      },
    ];
    expect(classifyRecovery(FAILED, succeeded)).toBe("recovered");
  });

  it("is unrecovered when no success matches the customer", () => {
    const succeeded: SucceededCharge[] = [
      {
        customerRef: "cus_other",
        email: "someone@else.com",
        occurredAt: at("2026-09-05T00:00:00Z"),
      },
    ];
    expect(classifyRecovery(FAILED, succeeded)).toBe("unrecovered");
  });

  it("is unrecovered when there are no successes at all", () => {
    expect(classifyRecovery(FAILED, [])).toBe("unrecovered");
  });

  it("ignores a success that clearly PRECEDED the failure (an earlier purchase)", () => {
    const succeeded: SucceededCharge[] = [
      { customerRef: "cus_abc", email: null, occurredAt: at("2026-08-01T00:00:00Z") },
    ];
    expect(classifyRecovery(FAILED, succeeded)).toBe("unrecovered");
  });

  it("counts an identity match as recovered when order cannot be established", () => {
    // Failure has no timestamp — we cannot order, so an identity match wins and
    // the row drops off the chase list rather than dunning a paid customer.
    const undated: FailedCharge = { ...FAILED, occurredAt: null };
    const succeeded: SucceededCharge[] = [
      { customerRef: "cus_abc", email: null, occurredAt: null },
    ];
    expect(classifyRecovery(undated, succeeded)).toBe("recovered");
  });

  it("never fuses two customers who merely both lack an email", () => {
    const noEmail: FailedCharge = { customerRef: null, email: null, occurredAt: null };
    const succeeded: SucceededCharge[] = [
      { customerRef: null, email: null, occurredAt: null },
    ];
    expect(classifyRecovery(noEmail, succeeded)).toBe("unrecovered");
  });
});

describe("effectiveRecoveryStatus", () => {
  it("a derived recovery wins over any disposition", () => {
    expect(effectiveRecoveryStatus("recovered", null)).toBe("recovered");
    expect(effectiveRecoveryStatus("recovered", "chasing")).toBe("recovered");
    expect(effectiveRecoveryStatus("recovered", "written_off")).toBe("recovered");
  });

  it("falls back to the admin disposition when not auto-recovered", () => {
    expect(effectiveRecoveryStatus("unrecovered", "recovered")).toBe("recovered");
    expect(effectiveRecoveryStatus("unrecovered", "chasing")).toBe("chasing");
    expect(effectiveRecoveryStatus("unrecovered", "written_off")).toBe("written_off");
  });

  it("is open when unrecovered and untouched", () => {
    expect(effectiveRecoveryStatus("unrecovered", null)).toBe("open");
  });
});

describe("still-recoverable accounting", () => {
  const row = (amountCents: number, effectiveStatus: EffectiveRecoveryStatus) => ({
    amountCents,
    effectiveStatus,
  });

  it("counts only open and chasing as still-recoverable", () => {
    expect(isStillRecoverable("open")).toBe(true);
    expect(isStillRecoverable("chasing")).toBe(true);
    expect(isStillRecoverable("recovered")).toBe(false);
    expect(isStillRecoverable("written_off")).toBe(false);
  });

  it("surfaces everything but a recovery in the inbox", () => {
    expect(isUnrecovered("open")).toBe(true);
    expect(isUnrecovered("chasing")).toBe(true);
    expect(isUnrecovered("written_off")).toBe(true);
    expect(isUnrecovered("recovered")).toBe(false);
  });

  it("sums attempted cents for open + chasing only, in integer cents", () => {
    const total = recoverableTotalCents([
      row(199_700, "open"),
      row(50_000, "chasing"),
      row(30_000, "written_off"),
      row(9_900, "recovered"),
    ]);
    expect(total).toBe(249_700);
    expect(Number.isInteger(total)).toBe(true);
  });

  it("is zero when nothing is still recoverable", () => {
    expect(
      recoverableTotalCents([row(1000, "written_off"), row(2000, "recovered")]),
    ).toBe(0);
    expect(recoverableTotalCents([])).toBe(0);
  });
});

describe("isRecoveryDisposition", () => {
  it("accepts the three dispositions and rejects anything else", () => {
    expect(isRecoveryDisposition("chasing")).toBe(true);
    expect(isRecoveryDisposition("recovered")).toBe(true);
    expect(isRecoveryDisposition("written_off")).toBe(true);
    expect(isRecoveryDisposition("open")).toBe(false);
    expect(isRecoveryDisposition("")).toBe(false);
    expect(isRecoveryDisposition(null)).toBe(false);
    expect(isRecoveryDisposition(undefined)).toBe(false);
  });
});

describe("MONEY INVARIANT — a failed charge never moves a total", () => {
  // The ONLY path from a captured processor event to the ledger is
  // paymentEventToTransaction. A declined charge (kind "failed") must be
  // refused there, so it can never become a transaction and therefore can
  // never move gross, net, revenue, or cash — it stays visibility-only.
  it("refuses to map a failed charge into a ledger row", () => {
    const out = paymentEventToTransaction(
      {
        provider: "stripe",
        externalId: "ch_declined_1",
        clientId: "client-1",
        kind: "failed",
        // A real, positive attempted amount — the refusal is about the KIND,
        // not the amount, so a big declined charge cannot sneak in.
        amountCents: 500_000,
        currency: "usd",
        email: "buyer@example.com",
        label: "charge.failed",
      },
      "2026-09-01",
    );
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("a failed charge must never map to a ledger row");
    expect(out.reason).toContain("failed");
  });
});
