import { describe, expect, it } from "vitest";

import type { CallLogRow } from "@/lib/calls/call-log";
import { callScoreboard } from "@/lib/calls/call-scoreboard";
import { dialingDetail } from "@/lib/crm/dialing-detail";
import { numbersForMcp } from "@/lib/mcp/numbers-shape";
import { applicationNumbers } from "@/lib/tracking/application-numbers";
import { cashCatalog } from "@/lib/tracking/cash-catalog";
import type { OfferNumbers } from "@/lib/tracking/numbers-loader";

const TZ = "America/Chicago";
const ALL = { from: null, to: null, label: "All time" };

const row = (extra: Partial<CallLogRow>): CallLogRow => ({
  bookingId: Math.random().toString(36).slice(2),
  inviteeName: null,
  inviteeEmail: "a@example.test",
  startsAt: new Date("2026-09-10T15:00:00Z"),
  eventType: null,
  provider: "calendly",
  rescheduled: false,
  state: "reported",
  confirmation: "in_time",
  confirmedRole: "dialer",
  outcome: "closed",
  outcomeWords: "signed up - pif",
  reportSource: "sheet",
  closer: null,
  setter: null,
  closeType: null,
  reportedCashCents: 150_050,
  reportedRevenueCents: 300_000,
  cancelReason: null,
  movedTo: null,
  movedFrom: null,
  ...extra,
});

function numbers(overrides: Partial<OfferNumbers> = {}): OfferNumbers {
  const log = [row({}), row({ outcome: "no_show", outcomeWords: "no show" })];
  return {
    bounds: ALL,
    person: null,
    personOptions: { closers: [], setters: [] },
    totalBookings: 2,
    calls: callScoreboard(log, ALL, TZ),
    cash: {
      source: "stripe",
      ticket: null,
      syncedAt: null,
      catalog: cashCatalog({
        payments: [
          {
            email: "a@example.test",
            cashCents: 150_050,
            status: "succeeded",
            occurredAt: new Date("2026-09-10T15:30:00Z"),
          },
        ],
        rules: [],
        from: new Date(0),
        to: new Date("2026-12-31T00:00:00Z"),
        timeZone: TZ,
      }),
    },
    applications: {
      numbers: applicationNumbers({
        source: "form",
        applications: [
          {
            email: "a@example.test",
            phone: null,
            submittedAt: new Date("2026-09-10T14:00:00Z"),
            formName: "Application",
            tagged: true,
          },
        ],
        calls: log,
        dials: [
          {
            email: "a@example.test",
            occurredAtMs: new Date("2026-09-10T14:04:00Z").getTime(),
          },
        ],
        bounds: ALL,
        timeZone: TZ,
      }),
      dialsConnected: true,
      capped: false,
    },
    dialing: {
      connected: true,
      capped: false,
      detail: dialingDetail(
        [
          {
            userId: "u1",
            userName: "Sam Carter",
            direction: "outbound",
            durationSeconds: 400,
            occurredAt: new Date("2026-09-10T14:04:00Z"),
            leadId: "l1",
            leadEmail: null,
            leadPhone: null,
            disposition: "answered",
          },
        ],
        TZ,
      ),
    },
    ...overrides,
  };
}

describe("numbersForMcp", () => {
  it("shapes money as dollar strings and rates as whole percents", () => {
    const out = numbersForMcp(numbers());
    expect(out.window).toEqual({ label: "All time", from: null, to: null });
    expect(out.cutTo).toBeNull();
    expect(out.cash).toMatchObject({
      source: "stripe",
      collected: "1500.50",
      revenueGenerated: "1500.50",
      leftToCollect: null,
      dealsInWindow: 0,
      revenueByDay: [],
      peopleWhoPaid: 1,
      averageOrder: "1500.50",
      afterFeesEstimate: null,
    });
    expect(out.cash?.byHourOfDay).toHaveLength(24);
    expect(out.calls?.verdicts).toMatchObject({
      held: 2,
      shows: 1,
      closes: 1,
      showRatePct: 50,
      closeRatePctOfShows: 100,
    });
    expect(out.calls?.howClosesPaid.paidInFull).toBe(1);
    expect(out.calls?.reportedOnCalls).toMatchObject({
      cash: "1500.50",
      contractValue: "3000.00",
      stillToCollect: "1499.50",
    });
    expect(out.calls?.confirmation.bySeat).toEqual([
      expect.objectContaining({ seat: "dialer", calls: 2, showRatePct: 50 }),
    ]);
    expect(out.applications).toMatchObject({
      submitted: 1,
      utmTagged: 1,
      appliedThenBookedPctOfApplicants: 100,
      speedToLead: { medianMinutes: 4, withinStandardPctOfDialled: 100, dialled: 1 },
    });
    expect(out.dialing).toMatchObject({
      dials: { count: 1, pickedUp: 1, qualityConversations: 1, pickupRatePct: 100 },
      talkMinutes: 7,
      byRep: [expect.objectContaining({ rep: "Sam Carter", isAPerson: true })],
    });
  });

  it("names the person a cut is for, and shapes cash by tag", () => {
    const out = numbersForMcp(
      numbers({
        person: { by: "closer", name: "Sam Carter" },
        cash: {
          source: "sheet",
          ticket: null,
          syncedAt: null,
          catalog: cashCatalog({
            payments: [
              {
                email: "a@example.test",
                cashCents: 4_900,
                status: "succeeded",
                occurredAt: new Date("2026-09-10T15:30:00Z"),
                label: "starter",
              },
            ],
            rules: [
              {
                id: "r1",
                tag: "frontend",
                matchField: "label",
                matchOp: "contains",
                matchValue: "starter",
                countsAsRevenue: true,
                countsAsOptin: false,
                exclude: false,
                excludeFromAov: false,
                hideFromDashboard: false,
                sortOrder: 0,
                active: true,
              },
            ],
            from: new Date(0),
            to: new Date("2026-12-31T00:00:00Z"),
            timeZone: TZ,
            deals: [
              {
                revenueCents: 20_000,
                cashCents: 4_900,
                occurredAt: new Date("2026-09-10T16:00:00Z"),
              },
            ],
          }),
        },
      }),
    );
    expect(out.cash).toMatchObject({
      revenueGenerated: "200.00",
      leftToCollect: "151.00",
      dealsInWindow: 1,
      revenueByDay: [{ day: "2026-09-10", revenue: "200.00" }],
    });
    expect(out.cutTo).toMatchObject({ by: "closer", name: "Sam Carter" });
    expect(out.cash?.byTag).toEqual([{ tag: "frontend", payments: 1, cash: "49.00" }]);
  });

  it("returns null sections instead of zeros when a source is missing", () => {
    const base = numbers();
    const out = numbersForMcp(
      numbers({
        totalBookings: 0,
        cash: { source: null, syncedAt: null, ticket: null, catalog: null },
        applications: {
          ...base.applications,
          numbers: { ...base.applications.numbers, source: null },
        },
        dialing: {
          connected: false,
          capped: false,
          detail: dialingDetail([], TZ),
        },
      }),
    );
    expect(out.cash).toBeNull();
    expect(out.applications).toBeNull();
    expect(out.calls).toBeNull();
    expect(out.dialing).toBeNull();
  });

  it("keeps speed to lead null without a dialler, and unknown rates null", () => {
    const base = numbers();
    const out = numbersForMcp(
      numbers({
        applications: { ...base.applications, dialsConnected: false },
        calls: callScoreboard([], ALL, TZ),
      }),
    );
    expect(out.applications?.speedToLead).toBeNull();
    expect(out.calls?.verdicts.showRatePct).toBeNull();
    expect(out.calls?.reportedOnCalls.cash).toBeNull();
  });
});
