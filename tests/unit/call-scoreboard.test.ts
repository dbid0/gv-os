import { describe, expect, it } from "vitest";

import type { CallLogRow } from "@/lib/calls/call-log";
import { callScoreboard, closeKindOf, verdictOf } from "@/lib/calls/call-scoreboard";

const TZ = "America/Chicago";
const ALL = { from: null, to: null, label: "All time" };

let n = 0;
function row(extra: Partial<CallLogRow>): CallLogRow {
  n += 1;
  return {
    bookingId: `b${n}`,
    inviteeName: null,
    inviteeEmail: `lead${n}@example.test`,
    startsAt: new Date("2026-09-10T15:00:00Z"),
    eventType: null,
    provider: "calendly",
    rescheduled: false,
    state: "reported",
    confirmation: "none",
    confirmedRole: null,
    outcome: "showed",
    outcomeWords: "follow up",
    reportSource: "sheet",
    closer: null,
    setter: null,
    closeType: null,
    reportedCashCents: null,
    reportedRevenueCents: null,
    cancelReason: null,
    movedTo: null,
    movedFrom: null,
    ...extra,
  };
}

describe("verdictOf", () => {
  it("sharpens a showed report into no-close or disqualified by its words", () => {
    expect(verdictOf(row({ outcome: "showed", outcomeWords: "follow up" }))).toBe(
      "no_close",
    );
    expect(verdictOf(row({ outcome: "showed", outcomeWords: "Not a fit" }))).toBe(
      "disqualified",
    );
    expect(verdictOf(row({ outcome: "showed", outcomeWords: "DQ - no money" }))).toBe(
      "disqualified",
    );
    expect(verdictOf(row({ outcome: "showed", outcomeWords: "unqualified" }))).toBe(
      "disqualified",
    );
    expect(verdictOf(row({ outcome: "showed", outcomeWords: null }))).toBe("no_close");
  });

  it("passes the other outcomes through, and null stays null", () => {
    expect(verdictOf(row({ outcome: "closed" }))).toBe("closed");
    expect(verdictOf(row({ outcome: "no_show" }))).toBe("no_show");
    expect(verdictOf(row({ outcome: "not_held" }))).toBe("not_held");
    expect(verdictOf(row({ outcome: null }))).toBeNull();
  });

  it("does not read a DQ inside another word", () => {
    expect(verdictOf(row({ outcome: "showed", outcomeWords: "adequate budget" }))).toBe(
      "no_close",
    );
  });
});

describe("closeKindOf", () => {
  it("reads form keys", () => {
    expect(closeKindOf("pif")).toBe("pif");
    expect(closeKindOf("split")).toBe("split");
    expect(closeKindOf("deposit")).toBe("deposit");
    expect(closeKindOf("installments")).toBe("installments");
  });

  it("reads sheet wording by meaning", () => {
    expect(closeKindOf("Paid in Full")).toBe("pif");
    expect(closeKindOf("signed up - PIF")).toBe("pif");
    expect(closeKindOf("One-time payment")).toBe("pif");
    expect(closeKindOf("2 pay")).toBe("split");
    expect(closeKindOf("3-pay")).toBe("split");
    expect(closeKindOf("Split Pay")).toBe("split");
    expect(closeKindOf("Payment plan")).toBe("installments");
    expect(closeKindOf("Monthly")).toBe("installments");
    expect(closeKindOf("Instalment")).toBe("installments");
  });

  it("lets a deposit win over a plan, and never guesses", () => {
    expect(closeKindOf("Deposit on a 3-pay")).toBe("deposit");
    expect(closeKindOf("Deposit then payment plan")).toBe("deposit");
    expect(closeKindOf("Gold package")).toBe("untyped");
    expect(closeKindOf("   ")).toBe("untyped");
    expect(closeKindOf(null)).toBe("untyped");
  });
});

describe("callScoreboard", () => {
  // A hand-counted offer. 14 bookings:
  //  1 closed pif, $5,000 cash / $5,000 contract, confirmed
  //  2 closed split, $2,000 cash / $6,000 contract, same person as #1
  //  3 closed untyped, no money stated
  //  4 follow-up (no-close), confirmed
  //  5 not a fit (disqualified)
  //  6 no-show, confirmed
  //  7 no-show
  //  8 rescheduled per the report (not held)
  //  9 cancelled by the calendar, rescheduled, confirmed
  // 10 cancelled
  // 11 upcoming, confirmed (awaiting)
  // 12 upcoming, never confirmed (new, upcoming)
  // 13 needs an outcome, never confirmed (new, stuck)
  // 14 needs an outcome, confirmed (awaiting — past, no verdict)
  const log: CallLogRow[] = [
    row({
      inviteeEmail: "a@example.test",
      outcome: "closed",
      outcomeWords: "closed won",
      confirmation: "in_time",
      closeType: "pif",
      reportedCashCents: 500_000,
      reportedRevenueCents: 500_000,
    }),
    row({
      inviteeEmail: "A@Example.test ",
      outcome: "closed",
      outcomeWords: "signed up - 2 pay",
      closeType: "2 pay",
      reportedCashCents: 200_000,
      reportedRevenueCents: 600_000,
    }),
    row({ outcome: "closed", outcomeWords: "closed won" }),
    row({ outcome: "showed", outcomeWords: "follow up", confirmation: "in_time" }),
    row({ outcome: "showed", outcomeWords: "not a fit" }),
    row({ outcome: "no_show", outcomeWords: "no show", confirmation: "in_time" }),
    row({ outcome: "no_show", outcomeWords: "no show" }),
    row({ outcome: "not_held", outcomeWords: "rescheduled" }),
    row({
      state: "cancelled",
      rescheduled: true,
      outcome: null,
      outcomeWords: null,
      confirmation: "in_time",
    }),
    row({ state: "cancelled", outcome: null, outcomeWords: null }),
    row({
      state: "upcoming",
      outcome: null,
      outcomeWords: null,
      confirmation: "in_time",
    }),
    row({ state: "upcoming", outcome: null, outcomeWords: null }),
    row({
      state: "needs_outcome",
      outcome: null,
      outcomeWords: null,
      confirmation: "after_start",
    }),
    row({
      state: "needs_outcome",
      outcome: null,
      outcomeWords: null,
      confirmation: "in_time",
    }),
  ];

  const s = callScoreboard(log, ALL, TZ);

  it("counts bookings, people and the calendar's own states", () => {
    expect(s.booked).toBe(14);
    expect(s.bookedPeople).toBe(13); // #1 and #2 are one person
    expect(s.cancelled).toBe(2);
    expect(s.rescheduled).toBe(1);
    expect(s.upcoming).toBe(2);
    expect(s.needsOutcome).toBe(2);
  });

  it("counts confirmation the reference way", () => {
    expect(s.everConfirmed).toBe(6); // 1, 4, 6, 9, 11, 14 (after_start never counts)
    expect(s.confirmedAwaiting).toBe(2); // 11, 14
    expect(s.newCalls).toBe(2); // 12, 13
    expect(s.newUpcoming).toBe(1);
    expect(s.newStuck).toBe(1);
  });

  it("breaks confirmed calls down by the seat that confirmed them", () => {
    expect(s.confirmedThenCancelled).toBe(1); // #9
    expect(s.byConfirmer).toEqual([
      {
        key: "unstated",
        calls: 6,
        cancelled: 1,
        held: 4, // 1 closed · 4 no-close · 6 no-show · 14 awaiting a report
        shows: 2,
        noShows: 1,
        closes: 1,
        showRate: (2 / 3) * 100,
        closeRate: 50,
      },
      {
        key: "none",
        calls: 8,
        cancelled: 1,
        held: 5, // 2, 3 closed · 5 DQ · 7 no-show · 13 stuck
        shows: 3,
        noShows: 1,
        closes: 2,
        showRate: 75,
        closeRate: (2 / 3) * 100,
      },
    ]);
    // The seats re-cut the same held calls.
    expect(s.byConfirmer.reduce((n, r) => n + r.held, 0)).toBe(s.held);
  });

  it("names the seat when the confirmation records one", () => {
    const seats = callScoreboard(
      [
        row({ confirmation: "in_time", confirmedRole: "dialer", outcome: "closed" }),
        row({ confirmation: "in_time", confirmedRole: "dialer", outcome: "no_show" }),
        row({ confirmation: "in_time", confirmedRole: "setter", outcome: "showed" }),
        row({
          confirmation: "in_time",
          confirmedRole: "dm_setter",
          state: "upcoming",
          outcome: null,
          outcomeWords: null,
        }),
        // Confirmed only after it started: not a confirmation, so no seat.
        row({
          confirmation: "after_start",
          confirmedRole: "setter",
          outcome: "closed",
        }),
      ],
      ALL,
      TZ,
    );
    expect(seats.byConfirmer.map((r) => [r.key, r.calls, r.held, r.closes])).toEqual([
      ["setter", 1, 1, 0],
      ["dialer", 2, 2, 1],
      ["dm_setter", 1, 0, 0],
      ["none", 1, 1, 1],
    ]);
    const dialer = seats.byConfirmer.find((r) => r.key === "dialer")!;
    expect(dialer.showRate).toBe(50);
    expect(dialer.closeRate).toBe(100);
    expect(seats.byConfirmer.find((r) => r.key === "dm_setter")!.showRate).toBeNull();
  });

  it("splits verdicts so shows = closes + no-closes + disqualified", () => {
    expect(s.closes).toBe(3);
    expect(s.noCloses).toBe(1);
    expect(s.disqualified).toBe(1);
    expect(s.noShows).toBe(2);
    expect(s.notHeld).toBe(1);
    expect(s.shows).toBe(5);
    expect(s.held).toBe(9); // 5 shows + 2 no-shows + 2 needing an outcome
  });

  it("counts how the closes paid", () => {
    expect(s.closeKinds).toEqual({
      pif: 1,
      split: 1,
      deposit: 0,
      installments: 0,
      untyped: 1,
    });
  });

  it("reads the money closers reported, per person", () => {
    expect(s.cashAtCallCents).toBe(700_000);
    expect(s.revenueAtCallCents).toBe(1_100_000);
    expect(s.payersAtCall).toBe(1);
    expect(s.aovAtCallCents).toBe(700_000);
    expect(s.cashPerCallCents).toBe(140_000); // 700,000 ÷ 5 shows
    expect(s.leftToCollectCents).toBe(400_000);
  });

  it("names every rate over its own denominator", () => {
    expect(s.rates.show).toBeCloseTo((5 / 7) * 100);
    expect(s.rates.noShow).toBeCloseTo((2 / 7) * 100);
    expect(s.rates.close).toBeCloseTo(60);
    expect(s.rates.noClose).toBeCloseTo(20);
    expect(s.rates.disqualified).toBeCloseTo(20);
    expect(s.rates.cancelled).toBeCloseTo((2 / 14) * 100);
    expect(s.rates.confirmed).toBeCloseTo((6 / 14) * 100);
    expect(s.rates.newStuck).toBeCloseTo((1 / 14) * 100);
    expect(s.rates.pif).toBeCloseTo((1 / 3) * 100);
    expect(s.rates.split).toBeCloseTo((1 / 3) * 100);
    expect(s.rates.deposit).toBe(0);
    expect(s.rates.installments).toBe(0);
  });

  it("keeps money null when no close states it, and rates null on zero denominators", () => {
    const empty = callScoreboard([], ALL, TZ);
    expect(empty.booked).toBe(0);
    expect(empty.cashAtCallCents).toBeNull();
    expect(empty.revenueAtCallCents).toBeNull();
    expect(empty.aovAtCallCents).toBeNull();
    expect(empty.cashPerCallCents).toBeNull();
    expect(empty.leftToCollectCents).toBeNull();
    expect(Object.values(empty.rates).every((r) => r === null)).toBe(true);

    const unpriced = callScoreboard(
      [row({ outcome: "closed", outcomeWords: "closed won" })],
      ALL,
      TZ,
    );
    expect(unpriced.cashAtCallCents).toBeNull();
    expect(unpriced.leftToCollectCents).toBeNull();
    expect(unpriced.rates.close).toBe(100);
  });

  it("reads the close type from the status words when no close type is stated", () => {
    const words = callScoreboard(
      [
        row({ outcome: "closed", outcomeWords: "Signed Up - PIF" }),
        row({ outcome: "closed", outcomeWords: "signed up - 2 pay" }),
        row({
          outcome: "closed",
          outcomeWords: "signed up - 2 pay",
          closeType: "deposit",
        }),
        row({ outcome: "closed", outcomeWords: "closed won" }),
      ],
      ALL,
      TZ,
    );
    expect(words.closeKinds).toEqual({
      pif: 1,
      split: 1,
      deposit: 1,
      installments: 0,
      untyped: 1,
    });
  });

  it("never lets collected cash over the contract read as negative still-due", () => {
    const over = callScoreboard(
      [
        row({
          outcome: "closed",
          outcomeWords: "closed won",
          reportedCashCents: 300_000,
          reportedRevenueCents: 200_000,
        }),
      ],
      ALL,
      TZ,
    );
    expect(over.leftToCollectCents).toBe(0);
  });

  it("counts a stated $0 as known cash, but not as a payer", () => {
    const zero = callScoreboard(
      [
        row({
          inviteeEmail: null,
          outcome: "closed",
          outcomeWords: "closed won",
          reportedCashCents: 0,
        }),
        row({
          inviteeEmail: null,
          outcome: "closed",
          outcomeWords: "closed won",
          reportedCashCents: 10_000,
        }),
      ],
      ALL,
      TZ,
    );
    expect(zero.cashAtCallCents).toBe(10_000);
    expect(zero.payersAtCall).toBe(1);
    expect(zero.bookedPeople).toBe(2); // no email: each booking is its own person
    expect(zero.aovAtCallCents).toBe(10_000);
  });

  it("windows by the call's start, and leaves undated calls out of a real window", () => {
    const windowed = callScoreboard(
      [
        row({ startsAt: new Date("2026-09-10T15:00:00Z"), outcome: "closed" }),
        row({ startsAt: new Date("2026-08-10T15:00:00Z"), outcome: "closed" }),
        row({ startsAt: null, outcome: "closed" }),
      ],
      { from: "2026-09-01", to: "2026-09-30", label: "This month" },
      TZ,
    );
    expect(windowed.booked).toBe(1);
    expect(windowed.closes).toBe(1);

    const all = callScoreboard(
      [row({ startsAt: null, outcome: "closed" }), row({ outcome: "closed" })],
      ALL,
      TZ,
    );
    expect(all.booked).toBe(2);
  });
});
