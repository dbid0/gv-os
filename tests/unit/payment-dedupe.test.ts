import { describe, expect, it } from "vitest";

import { dedupePaymentRows } from "@/lib/tracking/payment-dedupe";
import type { TrackingRow } from "@/lib/tracking/parse";

function payment(
  id: string | null,
  cents: number,
  extra: Partial<TrackingRow> = {},
): TrackingRow {
  return {
    tab: "payments",
    rowIndex: 1,
    occurredAt: null,
    email: null,
    name: null,
    phone: null,
    rep: null,
    status: "succeeded",
    outcome: null,
    cashCents: cents,
    revenueCents: null,
    recordingUrl: null,
    notes: null,
    payload: id === null ? {} : { "Transaction ID": id },
    ...extra,
  };
}

describe("dedupePaymentRows", () => {
  it("collapses rows sharing a transaction id to the FIRST", () => {
    // The real failure: the same charge pasted twice, doubling the total.
    const rows = dedupePaymentRows([payment("pi_1", 4900), payment("pi_1", 4900)]);
    expect(rows).toHaveLength(1);
  });

  it("keeps rows with NO id — dropping unproven duplicates loses real cash", () => {
    const rows = dedupePaymentRows([payment(null, 4900), payment(null, 4900)]);
    expect(rows).toHaveLength(2);
  });

  it("reads the id from whatever header the sheet used", () => {
    const a = payment(null, 100, { payload: { "Txn ID": "x1" } });
    const b = payment(null, 100, { payload: { "transaction id": "x1" } });
    expect(dedupePaymentRows([a, b])).toHaveLength(1);
  });

  it("never touches non-payment rows, even with matching ids", () => {
    const call = payment("pi_1", 0, { tab: "calls" });
    const call2 = payment("pi_1", 0, { tab: "calls" });
    expect(dedupePaymentRows([call, call2])).toHaveLength(2);
  });

  it("distinct ids all survive", () => {
    const rows = dedupePaymentRows([payment("a", 1), payment("b", 2), payment("c", 3)]);
    expect(rows).toHaveLength(3);
  });
});
