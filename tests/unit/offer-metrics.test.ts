import { describe, expect, it } from "vitest";

import {
  assembleOfferMetrics,
  BOARD_LIMIT,
  type OfferMetricsInputs,
} from "@/lib/tracking/offer-metrics";
import type { ActivityInput } from "@/lib/sales/call-activity";
import type { OfferStl } from "@/lib/crm/offer-stl";

const NOW = new Date("2026-09-09T12:00:00Z");
const T = (iso: string) => new Date(iso);

const DISCONNECTED_STL: OfferStl = {
  connected: false,
  medianMinutes: null,
  slaPct: null,
  measured: 0,
  applications: 0,
  everDialed: 0,
  byRep: [],
};

function inputs(extra: Partial<OfferMetricsInputs> = {}): OfferMetricsInputs {
  return {
    appDates: [],
    calls: [],
    dealRows: [],
    bookings: [],
    reportedEmails: new Set(),
    confirmations: [],
    stl: DISCONNECTED_STL,
    ...extra,
  };
}

function callLog(extra: Partial<ActivityInput> = {}): ActivityInput {
  return {
    mode: "call",
    disposition: "showed",
    repId: null,
    ...extra,
  } as ActivityInput;
}

describe("assembleOfferMetrics", () => {
  it("empty inputs = empty sections and nulls, never fabricated zeros", () => {
    const m = assembleOfferMetrics(inputs(), NOW);
    expect(m.apps.count).toBe(0);
    expect(m.paidMix).toBeNull(); // no rows ≠ "0 PIF / 0 split"
    expect(m.activity.showRate).toBeNull(); // no resolved calls ≠ 0% show rate
    expect(m.activity.closeRate).toBeNull();
    expect(m.board).toEqual([]);
    expect(m.stuck).toEqual([]);
    expect(m.confirmation).toEqual({
      everConfirmed: 0,
      ofBookings: 0,
      confirmedAwaiting: 0,
      confirmedThenCancelled: 0,
      // No reports loaded, no bookings: the split rates are unknown, not 0%.
      rates: null,
    });
    expect(m.stl.medianMinutes).toBeNull();
  });

  it("the board is the page total re-cut per rep — no rep invented for unassigned", () => {
    const calls = [
      callLog({ repId: "r1", disposition: "sale" }),
      callLog({ repId: "r1" }),
      callLog({ repId: null }), // unassigned: counts in totals, on no rep's row
    ];
    const m = assembleOfferMetrics(inputs({ calls }), NOW);
    expect(m.activity.calls).toBe(3);
    expect(m.board).toHaveLength(1);
    expect(m.board[0].repId).toBe("r1");
    expect(m.board[0].calls).toBe(2);
  });

  it("caps the board at the display limit", () => {
    const calls = Array.from({ length: BOARD_LIMIT + 3 }, (_, i) =>
      callLog({ repId: `r${i}` }),
    );
    const m = assembleOfferMetrics(inputs({ calls }), NOW);
    expect(m.board).toHaveLength(BOARD_LIMIT);
  });

  it("paid mix appears once there are deal rows", () => {
    const m = assembleOfferMetrics(
      inputs({
        dealRows: [
          { cashCents: 500000, revenueCents: 500000, label: null },
          { cashCents: 100000, revenueCents: 400000, label: null },
          { cashCents: 50000, revenueCents: 300000, label: "Deposit" },
        ],
      }),
      NOW,
    );
    expect(m.paidMix).not.toBeNull();
    expect(m.paidMix?.pif).toBe(1);
    expect(m.paidMix?.split).toBe(1);
    expect(m.paidMix?.deposit).toBe(1);
  });

  it("confirmation metrics count timely confirms against ALL bookings", () => {
    const bookings = [
      {
        id: "a",
        inviteeName: null,
        inviteeEmail: null,
        startsAt: T("2026-09-09T18:00:00Z"),
        status: "booked",
      },
      {
        id: "b",
        inviteeName: null,
        inviteeEmail: null,
        startsAt: T("2026-09-09T19:00:00Z"),
        status: "booked",
      },
    ];
    const m = assembleOfferMetrics(
      inputs({
        bookings,
        confirmations: [{ bookingId: "a", confirmedAt: T("2026-09-09T08:00:00Z") }],
      }),
      NOW,
    );
    expect(m.confirmation.everConfirmed).toBe(1);
    expect(m.confirmation.ofBookings).toBe(2);
    expect(m.confirmation.confirmedAwaiting).toBe(1);
  });

  it("rightNow counts upcoming, stuck and confirmed-awaiting from bookings", () => {
    const bookings = [
      {
        id: "up",
        inviteeName: null,
        inviteeEmail: null,
        startsAt: T("2026-09-09T18:00:00Z"),
        status: "booked",
      },
      {
        id: "stuck",
        inviteeName: null,
        inviteeEmail: null,
        startsAt: T("2026-09-09T09:00:00Z"),
        status: "booked",
      },
      {
        id: "cancelled",
        inviteeName: null,
        inviteeEmail: null,
        startsAt: T("2026-09-09T20:00:00Z"),
        status: "canceled",
      },
    ];
    const m = assembleOfferMetrics(
      inputs({
        bookings,
        confirmations: [{ bookingId: "up", confirmedAt: T("2026-09-09T08:00:00Z") }],
      }),
      NOW,
    );
    expect(m.rightNow).toEqual({ upcoming: 1, stuck: 1, confirmedAwaiting: 1 });
  });

  it("a stuck call and a confirmed-awaiting call are different bookings", () => {
    const bookings = [
      {
        id: "past",
        inviteeName: "A",
        inviteeEmail: "a@x.com",
        startsAt: T("2026-09-09T09:00:00Z"), // 3h ago, no outcome → stuck
        status: "booked",
      },
      {
        id: "future",
        inviteeName: "B",
        inviteeEmail: "b@x.com",
        startsAt: T("2026-09-09T18:00:00Z"),
        status: "booked",
      },
    ];
    const m = assembleOfferMetrics(
      inputs({
        bookings,
        confirmations: [
          { bookingId: "future", confirmedAt: T("2026-09-09T08:00:00Z") },
        ],
      }),
      NOW,
    );
    expect(m.stuck).toHaveLength(1);
    expect(m.stuck[0].inviteeEmail).toBe("a@x.com");
    expect(m.confirmation.confirmedAwaiting).toBe(1);
  });

  it("funnel, mix and money sections are null until their inputs exist", () => {
    const m = assembleOfferMetrics(inputs(), NOW);
    expect(m.funnel).toBeNull();
    expect(m.cashMix).toBeNull();
    expect(m.money).toBeNull();
  });

  it("range money reduces the window rows and carries the previous window", () => {
    const m = assembleOfferMetrics(
      inputs({
        rangeMoney: {
          rows: [
            { cashCents: 100000, revenueCents: 250000 },
            { cashCents: 50000, revenueCents: 50000 },
          ],
          prevCash: 300000,
          prevRevenue: 500000,
        },
      }),
      NOW,
    );
    expect(m.money).toEqual({
      rangeCash: 150000,
      rangeRevenue: 300000,
      prevRangeCash: 300000,
      prevRangeRevenue: 500000,
    });
  });

  it("a payment feed WINS over the ledger — the headline is the mix total, never a false $0", () => {
    // The bug: a client whose payments live in a snapshot has an EMPTY ledger,
    // so the ledger path returned $0 while the mix showed real cash. The feed
    // must win: the headline equals the mix total, and revenue is never $0.
    const payments = [
      {
        email: "a@x.com",
        cashCents: 100000,
        status: "succeeded",
        occurredAt: T("2026-09-05T10:00:00Z"),
      },
      {
        email: null,
        phone: null,
        cashCents: 8000,
        status: "succeeded",
        occurredAt: T("2026-09-12T10:00:00Z"),
      },
    ];
    const m = assembleOfferMetrics(
      inputs({
        mixWindow: {
          payments,
          from: T("2026-09-01T00:00:00Z"),
          to: T("2026-09-30T23:59:59Z"),
          windowRevenueCents: null, // processor-only feed: revenue == collected
          prevCollectedCents: 50000,
          prevWindowRevenueCents: null,
        },
        // An empty ledger that would have zeroed the headline before the fix.
        rangeMoney: { rows: [], prevCash: 0, prevRevenue: 0 },
      }),
      NOW,
    );
    const mixTotal =
      m.cashMix!.newCents +
      m.cashMix!.recurringSameMonthCents +
      m.cashMix!.afterFirstMonthCents +
      m.cashMix!.unplaceableCents;
    expect(mixTotal).toBe(108000);
    // Headline equals the mix — the feed won, the empty ledger did not zero it.
    expect(m.money?.rangeCash).toBe(108000);
    expect(m.money?.rangeCash).toBe(mixTotal);
    // Revenue falls back to collected (no deals) — never $0 under non-zero cash.
    expect(m.money?.rangeRevenue).toBe(108000);
    expect(m.money?.prevRangeCash).toBe(50000);
  });

  it("uses the feed's contracted value for revenue when it carries deals", () => {
    const m = assembleOfferMetrics(
      inputs({
        mixWindow: {
          payments: [
            {
              email: "a@x.com",
              cashCents: 100000,
              status: "succeeded",
              occurredAt: T("2026-09-05T10:00:00Z"),
            },
          ],
          from: T("2026-09-01T00:00:00Z"),
          to: T("2026-09-30T23:59:59Z"),
          windowRevenueCents: 250000,
          prevCollectedCents: null,
          prevWindowRevenueCents: null,
        },
      }),
      NOW,
    );
    expect(m.money?.rangeCash).toBe(100000);
    expect(m.money?.rangeRevenue).toBe(250000); // contract value > collected
    expect(m.money?.prevRangeCash).toBeNull();
    expect(m.money?.prevRangeRevenue).toBeNull();
  });

  it("funnel section builds from stitched leads with the offer's stages", () => {
    const lead = {
      email: "a@x.com",
      applied: true,
      callsBooked: 1,
      eocReports: 0,
      deals: 0,
      paymentsCents: 0,
    };
    const m = assembleOfferMetrics(
      inputs({
        funnelLeads: {
          leads: [lead as never],
          stageKeys: ["applied", "booked", "held", "closed", "paid"],
        },
      }),
      NOW,
    );
    expect(m.funnel).not.toBeNull();
    expect(m.funnel?.stages[0]).toMatchObject({ key: "applied", leads: 1 });
    expect(m.funnel?.stages[1]).toMatchObject({ key: "booked", leads: 1 });
  });

  it("an end-of-call report clears a would-be stuck call", () => {
    const m = assembleOfferMetrics(
      inputs({
        bookings: [
          {
            id: "past",
            inviteeName: "A",
            inviteeEmail: "A@X.com",
            startsAt: T("2026-09-09T09:00:00Z"),
            status: "booked",
          },
        ],
        reportedEmails: new Set(["a@x.com"]),
      }),
      NOW,
    );
    expect(m.stuck).toEqual([]);
  });
});
