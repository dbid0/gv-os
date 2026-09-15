/**
 * The Numbers page as MCP JSON — the same figures, shaped for an assistant.
 *
 * Conventions shared with every GV OS tool: money is a "1234.50" string of
 * dollars, rates are whole percents, and unknown is null — never a guessed
 * zero. Each section says what it counts over, so an assistant quoting a rate
 * can quote its denominator too.
 *
 * Pure: no database.
 */

import type { ConfirmerRow } from "@/lib/calls/call-scoreboard";
import type { Grain } from "@/lib/crm/dialing-detail";
import type { OfferNumbers } from "@/lib/tracking/numbers-loader";

const dollars = (cents: number | null | undefined): string | null =>
  cents === null || cents === undefined ? null : (cents / 100).toFixed(2);

const pct = (v: number | null): number | null => (v === null ? null : Math.round(v));

const grain = (g: Grain) => ({
  count: g.n,
  pickedUp: g.pickedUp,
  noAnswer: g.noAnswer,
  qualityConversations: g.quality,
  pickupRatePct: pct(g.pickupRate),
  qualityRatePctOfPickups: pct(g.qualityRate),
});

const confirmer = (r: ConfirmerRow) => ({
  seat: r.key,
  calls: r.calls,
  cancelled: r.cancelled,
  held: r.held,
  shows: r.shows,
  noShows: r.noShows,
  closes: r.closes,
  showRatePct: pct(r.showRate),
  closeRatePct: pct(r.closeRate),
});

export function numbersForMcp(n: OfferNumbers) {
  const c = n.calls;
  const cash = n.cash.catalog;
  const a = n.applications.numbers;
  const d = n.dialing;
  return {
    window: { label: n.bounds.label, from: n.bounds.from, to: n.bounds.to },
    cutTo: n.person
      ? {
          ...n.person,
          note: "Calls and dialing are cut to this person; cash and applications are the whole offer. Calls with no report yet name nobody, so they are not in a person's calls.",
        }
      : null,
    cash: cash
      ? {
          source: n.cash.source,
          note: "The offer's payment feed through its tag rules; equals the dashboard headline for the same window.",
          collected: dollars(cash.cashCollectedCents),
          payments: cash.collectedCount,
          peopleWhoPaid: cash.payers,
          averageOrder: dollars(cash.aovCents),
          paidWithNoCallFirst: dollars(cash.noCallCents),
          refunded: dollars(cash.refundedCents),
          refunds: cash.refundedCount,
          failedCharges: cash.failedCount,
          hiddenByTagRules: {
            payments: cash.hidden.count,
            cash: dollars(cash.hidden.cents),
          },
          afterFeesEstimate: dollars(cash.afterFeesEstimateCents),
          byTag: cash.byTag.map((t) => ({
            tag: t.tag,
            payments: t.count,
            cash: dollars(t.cents),
          })),
          untagged: dollars(cash.untaggedCents),
          byHourOfDay: cash.byHour.map((cents, hour) => ({
            hour,
            cash: dollars(cents),
          })),
          withNoTimeOfDay: dollars(cash.unplaceableHourCents),
          byDay: cash.byDay.map((x) => ({ day: x.day, cash: dollars(x.cents) })),
        }
      : null,
    applications:
      a.source === null
        ? null
        : {
            source: a.source,
            submitted: a.submitted,
            applicants: a.people,
            utmTagged: a.tagged,
            byForm: a.byForm,
            appliedThenBooked: a.bookedPeople,
            appliedThenBookedPctOfApplicants: pct(a.bookRate),
            bookedWithNoApplication: a.bookedNoApplication,
            undated: a.undated,
            speedToLead: n.applications.dialsConnected
              ? {
                  medianMinutes: a.speed.medianMinutes,
                  withinStandardPctOfDialled: pct(a.speed.withinSlaPct),
                  standardMinutes: a.speed.slaMinutes,
                  dialled: a.speed.matched,
                  dialable: a.speed.dialable,
                  neverDialledAfterApplying: a.speed.neverDialled,
                }
              : null,
          },
    calls:
      n.totalBookings === 0
        ? null
        : {
            booked: c.booked,
            peopleBooked: c.bookedPeople,
            upcoming: c.upcoming,
            needsAnOutcome: c.needsOutcome,
            cancelled: c.cancelled,
            cancelledPctOfBooked: pct(c.rates.cancelled),
            rescheduled: c.rescheduled,
            confirmation: {
              everConfirmed: c.everConfirmed,
              everConfirmedPctOfBooked: pct(c.rates.confirmed),
              confirmedAwaitingVerdict: c.confirmedAwaiting,
              confirmedThenCancelled: c.confirmedThenCancelled,
              newCalls: c.newCalls,
              newUpcoming: c.newUpcoming,
              newStuck: c.newStuck,
              bySeat: c.byConfirmer.map(confirmer),
            },
            verdicts: {
              held: c.held,
              shows: c.shows,
              closes: c.closes,
              noCloses: c.noCloses,
              disqualified: c.disqualified,
              noShows: c.noShows,
              notHeld: c.notHeld,
              showRatePct: pct(c.rates.show),
              noShowRatePct: pct(c.rates.noShow),
              closeRatePctOfShows: pct(c.rates.close),
              noCloseRatePctOfShows: pct(c.rates.noClose),
              disqualifiedPctOfShows: pct(c.rates.disqualified),
            },
            howClosesPaid: {
              paidInFull: c.closeKinds.pif,
              splitPay: c.closeKinds.split,
              installments: c.closeKinds.installments,
              deposit: c.closeKinds.deposit,
              untyped: c.closeKinds.untyped,
            },
            reportedOnCalls: {
              note: "What closers wrote on end-of-call reports — reports, not processor cash.",
              cash: dollars(c.cashAtCallCents),
              contractValue: dollars(c.revenueAtCallCents),
              stillToCollect: dollars(c.leftToCollectCents),
              peopleWhoPaid: c.payersAtCall,
              averageOrder: dollars(c.aovAtCallCents),
              cashPerCallTaken: dollars(c.cashPerCallCents),
            },
          },
    dialing:
      !d.connected && d.detail.total.dial.n === 0
        ? null
        : {
            dials: grain(d.detail.total.dial),
            attempts: grain(d.detail.total.attempt),
            leadDays: grain(d.detail.total.person),
            talkMinutes: Math.round(d.detail.total.talkSeconds / 60),
            unmeasuredDials: d.detail.total.unmeasured,
            byRep: d.detail.byRep.map((r) => ({
              rep: r.rep,
              isAPerson: !r.unattributed,
              dials: r.dial.n,
              attempts: r.attempt.n,
              leadDays: r.person.n,
              pickups: r.dial.pickedUp,
              pickupRatePct: pct(r.dial.pickupRate),
              qualityConversations: r.dial.quality,
              talkMinutes: Math.round(r.talkSeconds / 60),
            })),
            readNewestOnly: d.capped,
          },
  };
}
