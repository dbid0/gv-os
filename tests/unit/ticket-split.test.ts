import { describe, expect, it } from "vitest";

import { ticketSplit, type TicketPayment } from "@/lib/tracking/ticket-split";

const pay = (dollars: number): TicketPayment => ({
  cashCents: Math.round(dollars * 100),
});

const LOW_LINE = 4_900; // $49

describe("ticketSplit", () => {
  it("splits cash at the offer's line", () => {
    const s = ticketSplit([pay(49), pay(49), pay(5000), pay(2500)], LOW_LINE)!;
    expect(s.low).toEqual({ cents: 9_800, count: 2 });
    expect(s.high).toEqual({ cents: 750_000, count: 2 });
    expect(s.thresholdCents).toBe(LOW_LINE);
  });

  it("counts a payment exactly on the line as low ticket", () => {
    // "Low ticket is anything up to $49" is how a person says it.
    const s = ticketSplit([pay(49)], LOW_LINE)!;
    expect(s.low.count).toBe(1);
    expect(s.high.count).toBe(0);
  });

  it("puts a cent over the line into high ticket", () => {
    const s = ticketSplit([{ cashCents: LOW_LINE + 1 }], LOW_LINE)!;
    expect(s.high.count).toBe(1);
    expect(s.low.count).toBe(0);
  });

  it("never loses a payment between the bands", () => {
    const payments = [pay(9), pay(49), pay(50), pay(1200), pay(0.5)];
    const s = ticketSplit(payments, LOW_LINE)!;
    const total = payments.reduce((n, p) => n + p.cashCents, 0);
    expect(s.low.cents + s.high.cents).toBe(total);
    expect(s.low.count + s.high.count).toBe(payments.length);
  });

  it("gives no split at all when the offer has not set a line", () => {
    // A guessed split still looks like an answer, which is worse than none.
    expect(ticketSplit([pay(49), pay(5000)], null)).toBeNull();
    expect(ticketSplit([pay(49)], undefined)).toBeNull();
  });

  it("treats a zero or negative line as unset, not as a line at $0", () => {
    // 0 is how an emptied number field usually arrives.
    expect(ticketSplit([pay(49)], 0)).toBeNull();
    expect(ticketSplit([pay(49)], -100)).toBeNull();
  });

  it("reads an offer with no payments as two empty bands, not as unset", () => {
    const s = ticketSplit([], LOW_LINE)!;
    expect(s.low).toEqual({ cents: 0, count: 0 });
    expect(s.high).toEqual({ cents: 0, count: 0 });
  });

  it("handles a refund-style negative amount without miscounting it", () => {
    // Negatives should not reach here, but if one does it is below the line,
    // and it must not silently vanish from the totals.
    const s = ticketSplit([{ cashCents: -2_500 }, pay(5000)], LOW_LINE)!;
    expect(s.low).toEqual({ cents: -2_500, count: 1 });
    expect(s.low.cents + s.high.cents).toBe(497_500);
  });
});
