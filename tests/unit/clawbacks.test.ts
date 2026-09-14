import { describe, expect, it } from "vitest";

import {
  clawbacksAsCommissionRows,
  deriveClawbacks,
  refundedByCharge,
  suggestCharges,
  summarizeClawbacks,
  validateRefundLink,
  type LinkablePayment,
} from "@/lib/payments/clawbacks";
import {
  totalsByRep,
  type CommissionClaim,
  type CommissionRow,
} from "@/lib/payments/commissions";

const OFFER = "offer-1";
const T = (iso: string) => new Date(iso);

function pay(extra: Partial<LinkablePayment>): LinkablePayment {
  return {
    id: "charge",
    kind: "charge",
    clientId: OFFER,
    amountCents: 100_000,
    occurredAt: T("2026-09-01T12:00:00Z"),
    email: "buyer@x.com",
    ...extra,
  };
}

const refund = pay({
  id: "refund",
  kind: "refund",
  amountCents: -40_000,
  occurredAt: T("2026-09-05T12:00:00Z"),
});

describe("validateRefundLink", () => {
  const charge = pay({});
  const ok = (extra: Partial<Parameters<typeof validateRefundLink>[0]> = {}) =>
    validateRefundLink({ refund, charge, alreadyRefundedCents: 0, ...extra });

  it("accepts a same-offer refund of part of an earlier charge", () => {
    expect(ok()).toEqual({ ok: true });
    expect(ok({ alreadyRefundedCents: 60_000 })).toEqual({ ok: true }); // exactly the charge
  });

  it("refuses every link that would misstate what a rep owes back", () => {
    const reasons = [
      ok({ charge: pay({ id: "refund" }) }),
      ok({ refund: pay({ id: "r2", kind: "charge" }) }),
      ok({ charge: pay({ kind: "refund" }) }),
      ok({ charge: pay({ clientId: "other" }) }),
      ok({ refund: { ...refund, clientId: null }, charge: pay({ clientId: null }) }),
      ok({ charge: pay({ occurredAt: T("2026-09-06T00:00:00Z") }) }),
      ok({ alreadyRefundedCents: 60_001 }),
    ].map((v) => (v.ok ? "ok" : v.reason));
    expect(reasons).toEqual([
      "A refund can't be linked to itself.",
      "Only a refund can claw back commission.",
      "A refund can only be linked to a charge.",
      "The refund and the charge belong to different offers.",
      "The refund and the charge belong to different offers.",
      "That charge happened after this refund.",
      "Linking this would refund more than the charge took. Check it's the right charge.",
    ]);
  });

  it("lets undated payments link on the other rules alone", () => {
    expect(
      validateRefundLink({
        refund: { ...refund, occurredAt: null },
        charge: pay({ occurredAt: null }),
        alreadyRefundedCents: 0,
      }),
    ).toEqual({ ok: true });
  });
});

describe("suggestCharges", () => {
  it("keeps only linkable charges, the payer's own first, then the closest amount, then newest", () => {
    const charges = [
      pay({ id: "other-payer-close", email: "else@x.com", amountCents: 40_000 }),
      pay({ id: "mine-big", amountCents: 200_000 }),
      pay({
        id: "mine-close-old",
        amountCents: 50_000,
        occurredAt: T("2026-08-01T00:00:00Z"),
      }),
      pay({
        id: "mine-close-new",
        amountCents: 50_000,
        occurredAt: T("2026-09-02T00:00:00Z"),
      }),
      pay({ id: "too-small", amountCents: 30_000 }),
      pay({ id: "after-refund", occurredAt: T("2026-09-09T00:00:00Z") }),
      pay({ id: "other-offer", clientId: "x" }),
      pay({ id: "fully-refunded", amountCents: 50_000 }),
      pay({ id: "undated-mine", amountCents: 50_000, occurredAt: null }),
    ];
    const ids = suggestCharges(
      refund,
      charges,
      new Map([["fully-refunded", 20_000]]),
    ).map((c) => c.id);
    expect(ids).toEqual([
      "mine-close-new",
      "mine-close-old",
      "undated-mine",
      "mine-big",
      "other-payer-close",
    ]);
  });

  it("keeps two undated equal candidates in a stable order", () => {
    const ids = suggestCharges(
      refund,
      [
        pay({ id: "u1", amountCents: 50_000, occurredAt: null }),
        pay({ id: "u2", amountCents: 50_000, occurredAt: null }),
      ],
      new Map(),
    ).map((c) => c.id);
    expect(ids).toEqual(["u1", "u2"]);
  });

  it("without a payer email, ranks by amount alone and honours the limit", () => {
    const ids = suggestCharges(
      { ...refund, email: null },
      [pay({ id: "a", amountCents: 90_000 }), pay({ id: "b", amountCents: 45_000 })],
      new Map(),
      1,
    ).map((c) => c.id);
    expect(ids).toEqual(["b"]);
  });
});

describe("deriveClawbacks", () => {
  const claims: CommissionClaim[] = [
    {
      paymentEventId: "charge",
      role: "closer",
      repId: "rep-closer",
      rateOverrideBps: null,
    },
    {
      paymentEventId: "charge",
      role: "setter",
      repId: "rep-setter",
      rateOverrideBps: 500,
    },
    {
      paymentEventId: "charge",
      role: "dm_setter",
      repId: "rep-dm",
      rateOverrideBps: null,
    },
    {
      paymentEventId: "unrelated",
      role: "closer",
      repId: "rep-closer",
      rateOverrideBps: null,
    },
  ];
  const rules = [{ salesRole: "closer", rateBps: 1000, priority: 100 }];

  const rows = deriveClawbacks({
    refunds: [
      refund,
      pay({ id: "unlinked-refund", kind: "refund", amountCents: -10_000 }),
      pay({ id: "a-charge" }),
    ],
    links: [
      { refundEventId: "refund", chargeEventId: "charge" },
      { refundEventId: "a-charge", chargeEventId: "charge" },
    ],
    claims,
    rules,
    waivers: [
      { refundEventId: "refund", role: "setter", reason: "Chargeback was our fault" },
    ],
  });

  it("claws back each claimed seat on the linked charge, proportional to the refund", () => {
    expect(rows).toEqual([
      {
        refundEventId: "refund",
        chargeEventId: "charge",
        repId: "rep-closer",
        role: "closer",
        rateBps: 1000,
        clawbackCents: -4_000,
        waived: false,
        waiverReason: null,
      },
      {
        refundEventId: "refund",
        chargeEventId: "charge",
        repId: "rep-setter",
        role: "setter",
        rateBps: 500,
        clawbackCents: -2_000,
        waived: true,
        waiverReason: "Chargeback was our fault",
      },
      {
        refundEventId: "refund",
        chargeEventId: "charge",
        repId: "rep-dm",
        role: "dm_setter",
        rateBps: null,
        clawbackCents: null,
        waived: false,
        waiverReason: null,
      },
    ]);
  });

  it("rounds half away from zero like commissions do", () => {
    const [row] = deriveClawbacks({
      refunds: [{ ...refund, amountCents: -12_345 }],
      links: [{ refundEventId: "refund", chargeEventId: "charge" }],
      claims: [claims[1]],
      rules: [],
      waivers: [],
    });
    // 12,345 × 5% = 617.25 → 617
    expect(row.clawbackCents).toBe(-617);
  });

  it("feeds rep totals net of commission, leaving waived rows out", () => {
    const commission: CommissionRow[] = [
      {
        paymentEventId: "charge",
        repId: "rep-closer",
        role: "closer",
        rateBps: 1000,
        commissionCents: 10_000,
      },
      {
        paymentEventId: "charge",
        repId: "rep-setter",
        role: "setter",
        rateBps: 500,
        commissionCents: 5_000,
      },
    ];
    const totals = totalsByRep(commission.concat(clawbacksAsCommissionRows(rows)));
    expect(totals).toEqual([
      { repId: "rep-closer", totalCents: 6_000, unknownRateRows: 0 },
      { repId: "rep-setter", totalCents: 5_000, unknownRateRows: 0 },
      { repId: "rep-dm", totalCents: 0, unknownRateRows: 1 },
    ]);
  });

  it("summarises counted, waived and unpriced clawbacks", () => {
    expect(summarizeClawbacks(rows)).toEqual({
      counted: 1,
      countedCents: -4_000,
      waived: 1,
      waivedCents: -2_000,
      unknownRate: 1,
    });
    expect(summarizeClawbacks([])).toEqual({
      counted: 0,
      countedCents: 0,
      waived: 0,
      waivedCents: 0,
      unknownRate: 0,
    });
  });
});

describe("refundedByCharge", () => {
  it("sums linked refund magnitudes per charge, unknown amounts as zero", () => {
    const out = refundedByCharge(
      [
        { refundEventId: "r1", chargeEventId: "c1" },
        { refundEventId: "r2", chargeEventId: "c1" },
        { refundEventId: "r3", chargeEventId: "c2" },
      ],
      new Map([
        ["r1", -1_000],
        ["r2", 500],
      ]),
    );
    expect([...out.entries()]).toEqual([
      ["c1", 1_500],
      ["c2", 0],
    ]);
  });
});
