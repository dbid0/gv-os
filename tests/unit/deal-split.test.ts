import { describe, expect, it } from "vitest";

import {
  noteWithPayees,
  payeeCents,
  payeesNote,
  splitDeal,
  type DealPayee,
  type PartnerShare,
} from "@/lib/accounting/deal-split";

const HALF: PartnerShare[] = [
  { name: "Ada", bps: 5000 },
  { name: "Grace", bps: 5000 },
];

/** Nothing may evaporate: the parts must re-add to the whole, every time. */
const expectExact = (split: ReturnType<typeof splitDeal>) => {
  const partners = split.partners.reduce((n, p) => n + p.cents, 0);
  expect(partners).toBe(split.remainingCents);
  if (!split.overdrawn) {
    expect(split.payeeTotalCents + split.remainingCents).toBe(split.netCents);
  }
};

describe("payeeCents", () => {
  it("pays a fixed payee exactly what was entered", () => {
    expect(payeeCents(1_000_000, { name: "G", kind: "fixed", value: 31_339 })).toBe(
      31_339,
    );
    // A fixed amount does not move with the size of the deal.
    expect(payeeCents(50, { name: "G", kind: "fixed", value: 31_339 })).toBe(31_339);
  });

  it("measures a percentage payee against net", () => {
    expect(payeeCents(1_000_000, { name: "J", kind: "percent", value: 1000 })).toBe(
      100_000,
    );
  });

  it("rounds a percentage half away from zero", () => {
    // 10.005 → 1001 cents (rounds up), not 1000.
    expect(payeeCents(20_010, { name: "J", kind: "percent", value: 5000 })).toBe(
      10_005,
    );
    expect(payeeCents(333, { name: "J", kind: "percent", value: 5000 })).toBe(167);
  });
});

describe("splitDeal", () => {
  it("divides a clean deal between the partners", () => {
    const s = splitDeal(1_000_000, [], HALF);
    expect(s.partners).toEqual([
      { name: "Ada", cents: 500_000 },
      { name: "Grace", cents: 500_000 },
    ]);
    expect(s.remainingCents).toBe(1_000_000);
    expectExact(s);
  });

  it("takes the payees off the top before the partners split", () => {
    // The shape the sheet describes in prose: a third party takes 10%, the
    // partners divide what is left — NOT the whole net.
    const payees: DealPayee[] = [{ name: "Jai", kind: "percent", value: 1000 }];
    const s = splitDeal(1_000_000, payees, HALF);

    expect(s.payees).toEqual([{ name: "Jai", kind: "percent", cents: 100_000 }]);
    expect(s.remainingCents).toBe(900_000);
    expect(s.partners.map((p) => p.cents)).toEqual([450_000, 450_000]);
    expectExact(s);
  });

  it("measures every percentage payee against net, not against each other", () => {
    // If the second payee were measured on what the first left behind, two
    // people quoted "10%" would receive different money and neither could
    // check their own cut.
    const s = splitDeal(
      1_000_000,
      [
        { name: "A", kind: "percent", value: 1000 },
        { name: "B", kind: "percent", value: 1000 },
      ],
      HALF,
    );
    expect(s.payees.map((p) => p.cents)).toEqual([100_000, 100_000]);
    expect(s.remainingCents).toBe(800_000);
    expectExact(s);
  });

  it("mixes a fixed payee and a percentage payee on one deal", () => {
    // Both of the real cases at once: "10% to jaiden" and "owe Gerard 313.39".
    const s = splitDeal(
      1_000_000,
      [
        { name: "Jai", kind: "percent", value: 1000 },
        { name: "Ger", kind: "fixed", value: 31_339 },
      ],
      HALF,
    );
    expect(s.payeeTotalCents).toBe(131_339);
    expect(s.remainingCents).toBe(868_661);
    expectExact(s);
  });

  it("never loses a penny to rounding", () => {
    // An odd remainder cannot divide evenly; the last partner absorbs it so
    // the deal still adds up.
    const s = splitDeal(1_001, [], HALF);
    expect(s.partners.map((p) => p.cents)).toEqual([501, 500]);
    expectExact(s);
  });

  it("keeps a three-way split exact too", () => {
    const thirds: PartnerShare[] = [
      { name: "A", bps: 3333 },
      { name: "B", bps: 3333 },
      { name: "C", bps: 3334 },
    ];
    const s = splitDeal(100_000, [], thirds);
    expectExact(s);
    expect(s.partners.reduce((n, p) => n + p.cents, 0)).toBe(100_000);
  });

  it("honours an uneven partner share", () => {
    const s = splitDeal(
      1_000_000,
      [],
      [
        { name: "Ada", bps: 3000 },
        { name: "Grace", bps: 7000 },
      ],
    );
    expect(s.partners.map((p) => p.cents)).toEqual([300_000, 700_000]);
    expectExact(s);
  });

  it("flags an overdraw instead of paying a partner a negative share", () => {
    const s = splitDeal(
      100_000,
      [{ name: "Too big", kind: "fixed", value: 150_000 }],
      HALF,
    );
    expect(s.overdrawn).toBe(true);
    expect(s.remainingCents).toBe(0);
    // A negative payout would look like a deliberate clawback.
    expect(s.partners.map((p) => p.cents)).toEqual([0, 0]);
  });

  it("does not call an exactly-consumed deal an overdraw", () => {
    const s = splitDeal(
      100_000,
      [{ name: "All of it", kind: "fixed", value: 100_000 }],
      HALF,
    );
    expect(s.overdrawn).toBe(false);
    expect(s.remainingCents).toBe(0);
    expectExact(s);
  });

  it("handles a deal that made nothing", () => {
    const s = splitDeal(0, [], HALF);
    expect(s.remainingCents).toBe(0);
    expect(s.partners.map((p) => p.cents)).toEqual([0, 0]);
    expectExact(s);
  });

  it("does not invent money when a fee ate more than the deal made", () => {
    // Real: a tiny payment where the processor's flat charge exceeds the cash
    // leaves a NEGATIVE net. The partners cannot be paid out of that, and a
    // percentage of it must round the same way in both directions.
    expect(payeeCents(-900, { name: "J", kind: "percent", value: 5000 })).toBe(-450);

    const s = splitDeal(-900, [], HALF);
    expect(s.remainingCents).toBe(-900);
    expect(s.overdrawn).toBe(false);
    // The loss is shared, not hidden, and still adds up exactly.
    expect(s.partners.map((p) => p.cents)).toEqual([-450, -450]);
    expectExact(s);
  });

  it("survives a deal with no partners recorded", () => {
    const s = splitDeal(100_000, [{ name: "J", kind: "percent", value: 1000 }], []);
    expect(s.partners).toEqual([]);
    expect(s.remainingCents).toBe(90_000);
  });
});

describe("payeesNote", () => {
  it("writes the payees in a shape that can be read back", () => {
    expect(
      payeesNote([
        { name: "Jaiden", kind: "percent", value: 1000 },
        { name: "Gerard", kind: "fixed", value: 31_339 },
      ]),
    ).toBe("Payouts: Jaiden 10%; Gerard $313.39");

    // No payees leaves the note exactly as the person typed it.
    expect(payeesNote([])).toBe("");
    expect(noteWithPayees("  2000 in 14 days  ", [])).toBe("2000 in 14 days");

    expect(
      noteWithPayees("2000 in 14 days", [
        { name: "Jaiden", kind: "percent", value: 1000 },
      ]),
    ).toBe("2000 in 14 days — Payouts: Jaiden 10%");

    // An empty note does not gain a stray dash.
    expect(noteWithPayees("", [{ name: "Jaiden", kind: "percent", value: 1000 }])).toBe(
      "Payouts: Jaiden 10%",
    );
  });
});
