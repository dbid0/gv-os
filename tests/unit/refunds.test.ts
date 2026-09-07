import { describe, expect, it } from "vitest";

import { classifyPayment, totalPayments } from "@/lib/tracking/refunds";

const row = (cashCents: number | null, status: string | null = "succeeded") => ({
  cashCents,
  status,
});

describe("classifyPayment", () => {
  it("reads the processors' own words for money going back", () => {
    // Stripe and Shopify both use these; no convention was imposed.
    for (const s of [
      "refunded",
      "Refund",
      "chargeback",
      "reversed",
      "disputed",
      "returned",
    ]) {
      expect(classifyPayment(row(99_700, s))).toBe("refunded");
    }
  });

  it("treats a NEGATIVE amount as a refund whatever the status says", () => {
    // An accountant writing -1500 means it went back, whatever sits beside it.
    expect(classifyPayment(row(-150_000, "succeeded"))).toBe("refunded");
    expect(classifyPayment(row(-150_000, null))).toBe("refunded");
  });

  it("keeps a FAILED charge apart from a refund", () => {
    // Nothing came in, so nothing goes back out. Counting it either way is wrong.
    for (const s of [
      "failed",
      "declined",
      "canceled",
      "cancelled",
      "expired",
      "voided",
    ]) {
      expect(classifyPayment(row(99_700, s))).toBe("failed");
    }
  });

  it("treats an ordinary payment as collected", () => {
    expect(classifyPayment(row(99_700, "succeeded"))).toBe("collected");
    expect(classifyPayment(row(99_700, ""))).toBe("collected");
    expect(classifyPayment(row(99_700, null))).toBe("collected");
  });
});

describe("totalPayments", () => {
  it("SUBTRACTS a refund instead of counting it as cash", () => {
    // The failure mode this exists to stop: a refunded charge making a month
    // look better than it was.
    const t = totalPayments([row(500_000), row(150_000, "refunded")]);
    expect(t.grossCents).toBe(500_000);
    expect(t.refundedCents).toBe(150_000);
    expect(t.netCents).toBe(350_000);
  });

  it("handles the real shape of The Grid's refunds", () => {
    // $1,500 back on Shopify and $997 on Stripe, however they get written.
    const t = totalPayments([
      row(5_737_600),
      row(-150_000), // negative row
      row(99_700, "refunded"), // status-based
    ]);
    expect(t.refundedCents).toBe(249_700);
    expect(t.netCents).toBe(5_737_600 - 249_700);
  });

  it("reports refunds as a POSITIVE number — the sign lives in the label", () => {
    const t = totalPayments([row(-150_000)]);
    expect(t.refundedCents).toBe(150_000);
    expect(t.netCents).toBe(-150_000);
  });

  it("excludes a failed charge from BOTH totals", () => {
    const t = totalPayments([row(500_000), row(99_700, "failed")]);
    expect(t.grossCents).toBe(500_000);
    expect(t.refundedCents).toBe(0);
    expect(t.failedCents).toBe(99_700);
    expect(t.netCents).toBe(500_000);
  });

  it("counts each kind so a month can say what it is made of", () => {
    const t = totalPayments([
      row(100),
      row(200, "refunded"),
      row(300, "failed"),
      row(400),
    ]);
    expect(t.collectedCount).toBe(2);
    expect(t.refundedCount).toBe(1);
    expect(t.failedCount).toBe(1);
  });

  it("survives rows with no amount at all", () => {
    const t = totalPayments([row(null), row(null, "refunded")]);
    expect(t).toMatchObject({ grossCents: 0, refundedCents: 0, netCents: 0 });
  });

  it("is all zeros for an empty log", () => {
    expect(totalPayments([])).toMatchObject({ grossCents: 0, netCents: 0 });
  });

  it("matches today's sheet exactly, which records no refunds", () => {
    // 77 rows, all succeeded: net must equal gross, so nothing changes for a
    // client who has not started recording refunds yet.
    const rows = Array.from({ length: 77 }, () => row(74_500));
    const t = totalPayments(rows);
    expect(t.netCents).toBe(t.grossCents);
    expect(t.refundedCents).toBe(0);
  });
});
