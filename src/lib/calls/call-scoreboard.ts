/**
 * THE CALL SCOREBOARD — every call number an offer has, from the call log.
 *
 * The reference product's call metrics, rebuilt on GV OS's one per-call model
 * (the call log: booking + confirmation + end-of-call report). Every figure is
 * a count over those rows, so the scoreboard can never disagree with the Calls
 * page, the confirmation split or calls-by-closer — they read the same rows.
 *
 * Definitions (each tested):
 *
 * BOOKED
 * - booked            every booking on the counted calendar (cancelled included)
 * - bookedPeople      distinct invitees (email; a booking with no email is its own person)
 * - cancelled         bookings the calendar cancelled; rescheduled = the subset that moved
 * - upcoming          not cancelled, start still ahead (within the one-hour grace)
 * - needsOutcome      start passed, not cancelled, no usable report — "stuck"
 *
 * CONFIRMATION
 * - everConfirmed     confirmed before the call started, whatever happened after
 * - confirmedAwaiting confirmed in time, no verdict yet, not cancelled
 * - newCalls          not cancelled, never confirmed, no verdict yet
 * - newUpcoming / newStuck   new calls still ahead / whose time has passed
 * - confirmedThenCancelled   confirmed in time, then the calendar cancelled it
 * - byConfirmer        calls confirmed in time, per seat that confirmed them
 *                      (setter · dialer · DM setter · unstated), beside the
 *                      calls nobody confirmed: confirmed, cancelled, held,
 *                      shows, no-shows, closes, show and close rate — so
 *                      "does a dialer's confirmation hold?" is a number
 *
 * VERDICTS (a held call's report)
 * - closes            the report says they bought
 * - disqualified      showed and the report says not a fit / DQ
 * - noCloses          showed, didn't buy, not disqualified (follow-ups, "thinking")
 * - noShows           never joined
 * - shows             closes + noCloses + disqualified — every call that reached a verdict
 * - notHeld           the report says rescheduled/cancelled: not a call, outside every rate
 *
 * HOW CLOSES PAID (the report's close type; else its status words, e.g. "signed up - pif")
 * - pif · split · deposit · installments · untyped (a close that doesn't say)
 *
 * MONEY ON THE CALLS — what closers REPORTED, never the processor's record
 * - cashAtCallCents     cash reported on closes; null when no close states cash
 * - revenueAtCallCents  contract value reported on closes; null when none states it
 * - payersAtCall        distinct people on closes that reported cash > 0
 * - aovAtCallCents      cashAtCall ÷ payersAtCall
 * - cashPerCallCents    cashAtCall ÷ shows (cash per call taken)
 * - leftToCollectCents  max(0, revenueAtCall − cashAtCall), only when both are known
 *
 * RATES are 0–100 or null on a zero denominator — a dash, never 0%:
 * showRate / noShowRate ÷ (shows + noShows) · closeRate / noCloseRate /
 * disqualifiedRate ÷ shows · cancelledRate / confirmedRate / newStuckRate ÷
 * booked · pifRate / splitRate / depositRate / installmentsRate ÷ closes.
 *
 * Window: a call belongs to the window its START falls in (the viewer's days).
 * All time also takes undated bookings; a real window can't place them.
 *
 * Pure: no clock, no database.
 */

import type { CallLogRow } from "@/lib/calls/call-log";
import type { RangeBounds } from "@/lib/transactions/homepage";
import { inWindow } from "@/lib/tracking/report-window";

export type Verdict = "closed" | "no_close" | "disqualified" | "no_show" | "not_held";

export type CloseKind = "pif" | "split" | "deposit" | "installments" | "untyped";

export type ConfirmerKey = "setter" | "dialer" | "dm_setter" | "unstated" | "none";

export type ConfirmerRow = {
  key: ConfirmerKey;
  /** Calls in this group (for "none": calls never confirmed in time). */
  calls: number;
  cancelled: number;
  held: number;
  shows: number;
  noShows: number;
  closes: number;
  showRate: number | null;
  closeRate: number | null;
};

export const CONFIRMER_KEYS: readonly ConfirmerKey[] = [
  "setter",
  "dialer",
  "dm_setter",
  "unstated",
  "none",
];

export type CallScoreboard = {
  booked: number;
  bookedPeople: number;
  cancelled: number;
  rescheduled: number;
  upcoming: number;
  needsOutcome: number;

  everConfirmed: number;
  confirmedAwaiting: number;
  newCalls: number;
  newUpcoming: number;
  newStuck: number;
  confirmedThenCancelled: number;
  /** Seats with at least one call, in CONFIRMER_KEYS order; "none" last. */
  byConfirmer: ConfirmerRow[];

  held: number;
  shows: number;
  closes: number;
  noCloses: number;
  disqualified: number;
  noShows: number;
  notHeld: number;

  closeKinds: Record<CloseKind, number>;

  cashAtCallCents: number | null;
  revenueAtCallCents: number | null;
  payersAtCall: number;
  aovAtCallCents: number | null;
  cashPerCallCents: number | null;
  leftToCollectCents: number | null;

  rates: {
    show: number | null;
    noShow: number | null;
    close: number | null;
    noClose: number | null;
    disqualified: number | null;
    cancelled: number | null;
    confirmed: number | null;
    newStuck: number | null;
    pif: number | null;
    split: number | null;
    deposit: number | null;
    installments: number | null;
  };
};

const DISQUALIFIED = /(not a fit|\bdq\b|\bdq'?d\b|disqualif|unqualified|not qualified)/;

/** A reported outcome, sharpened: a "showed" report is a no-close or a DQ. */
export function verdictOf(row: CallLogRow): Verdict | null {
  switch (row.outcome) {
    case null:
      return null;
    case "closed":
      return "closed";
    case "no_show":
      return "no_show";
    case "not_held":
      return "not_held";
    default:
      return DISQUALIFIED.test((row.outcomeWords ?? "").toLowerCase())
        ? "disqualified"
        : "no_close";
  }
}

/**
 * How a close paid, from its close type. Form keys read directly; sheet words
 * read by meaning. Deposit wins over a plan ("deposit on a 3-pay"), a plan's
 * installments over a split, and anything unrecognised is untyped — never
 * guessed from the money.
 */
export function closeKindOf(closeType: string | null): CloseKind {
  const words = (closeType ?? "").trim().toLowerCase();
  if (words === "") return "untyped";
  if (/deposit/.test(words)) return "deposit";
  if (/(\bpif\b|paid in full|pay in full|full pay|one.?time|upfront)/.test(words))
    return "pif";
  if (/(installment|instalment|monthly|payment plan|\bplan\b)/.test(words))
    return "installments";
  if (/(split|\b\d\s*-?\s*pay\b|two pay|three pay)/.test(words)) return "split";
  return "untyped";
}

const rate = (num: number, den: number): number | null =>
  den === 0 ? null : (num / den) * 100;

export function callScoreboard(
  log: CallLogRow[],
  bounds: RangeBounds,
  timeZone: string,
): CallScoreboard {
  const rows = log.filter((r) => inWindow(r.startsAt, bounds, timeZone));

  const people = new Set<string>();
  const payers = new Set<string>();
  const closeKinds: Record<CloseKind, number> = {
    pif: 0,
    split: 0,
    deposit: 0,
    installments: 0,
    untyped: 0,
  };
  const board = {
    cancelled: 0,
    rescheduled: 0,
    upcoming: 0,
    needsOutcome: 0,
    everConfirmed: 0,
    confirmedAwaiting: 0,
    newCalls: 0,
    newUpcoming: 0,
    newStuck: 0,
    closes: 0,
    noCloses: 0,
    disqualified: 0,
    noShows: 0,
    notHeld: 0,
  };
  let cash: number | null = null;
  let revenue: number | null = null;
  let confirmedThenCancelled = 0;
  const confirmers = new Map<ConfirmerKey, ConfirmerRow>();
  const confirmerOf = (r: CallLogRow): ConfirmerRow => {
    const key: ConfirmerKey =
      r.confirmation !== "in_time"
        ? "none"
        : r.confirmedRole === "setter" ||
            r.confirmedRole === "dialer" ||
            r.confirmedRole === "dm_setter"
          ? r.confirmedRole
          : "unstated";
    let row = confirmers.get(key);
    if (!row) {
      row = {
        key,
        calls: 0,
        cancelled: 0,
        held: 0,
        shows: 0,
        noShows: 0,
        closes: 0,
        showRate: null,
        closeRate: null,
      };
      confirmers.set(key, row);
    }
    return row;
  };

  for (const r of rows) {
    people.add(r.inviteeEmail?.trim().toLowerCase() || `booking:${r.bookingId}`);
    const confirmed = r.confirmation === "in_time";
    if (confirmed) board.everConfirmed += 1;
    const seat = confirmerOf(r);
    seat.calls += 1;

    if (r.state === "cancelled") {
      board.cancelled += 1;
      seat.cancelled += 1;
      if (confirmed) confirmedThenCancelled += 1;
      if (r.rescheduled) board.rescheduled += 1;
      continue;
    }

    const verdict = verdictOf(r);
    if (verdict === null ? r.state === "needs_outcome" : verdict !== "not_held") {
      seat.held += 1;
    }
    if (verdict === "no_show") seat.noShows += 1;
    if (verdict === "closed" || verdict === "no_close" || verdict === "disqualified") {
      seat.shows += 1;
    }
    if (verdict === "closed") seat.closes += 1;
    if (verdict === null) {
      if (r.state === "upcoming") board.upcoming += 1;
      else board.needsOutcome += 1;
      if (confirmed) {
        board.confirmedAwaiting += 1;
      } else {
        board.newCalls += 1;
        if (r.state === "upcoming") board.newUpcoming += 1;
        else board.newStuck += 1;
      }
      continue;
    }

    switch (verdict) {
      case "not_held":
        board.notHeld += 1;
        break;
      case "no_show":
        board.noShows += 1;
        break;
      case "disqualified":
        board.disqualified += 1;
        break;
      case "no_close":
        board.noCloses += 1;
        break;
      case "closed": {
        board.closes += 1;
        // The close type column first; sheets that write it into the status
        // ("signed up - 2 pay") state it there instead.
        closeKinds[closeKindOf(r.closeType ?? r.outcomeWords)] += 1;
        if (r.reportedCashCents !== null) {
          cash = (cash ?? 0) + r.reportedCashCents;
          if (r.reportedCashCents > 0) {
            payers.add(
              r.inviteeEmail?.trim().toLowerCase() || `booking:${r.bookingId}`,
            );
          }
        }
        if (r.reportedRevenueCents !== null) {
          revenue = (revenue ?? 0) + r.reportedRevenueCents;
        }
        break;
      }
    }
  }

  const shows = board.closes + board.noCloses + board.disqualified;
  const booked = rows.length;
  const answered = shows + board.noShows;

  return {
    booked,
    bookedPeople: people.size,
    ...board,
    confirmedThenCancelled,
    byConfirmer: CONFIRMER_KEYS.flatMap((key) => {
      const row = confirmers.get(key);
      return row
        ? [
            {
              ...row,
              showRate: rate(row.shows, row.shows + row.noShows),
              closeRate: rate(row.closes, row.shows),
            },
          ]
        : [];
    }),
    held: shows + board.noShows + board.needsOutcome,
    shows,
    closeKinds,
    cashAtCallCents: cash,
    revenueAtCallCents: revenue,
    payersAtCall: payers.size,
    aovAtCallCents:
      cash !== null && payers.size > 0 ? Math.round(cash / payers.size) : null,
    cashPerCallCents: cash !== null && shows > 0 ? Math.round(cash / shows) : null,
    leftToCollectCents:
      cash !== null && revenue !== null ? Math.max(0, revenue - cash) : null,
    rates: {
      show: rate(shows, answered),
      noShow: rate(board.noShows, answered),
      close: rate(board.closes, shows),
      noClose: rate(board.noCloses, shows),
      disqualified: rate(board.disqualified, shows),
      cancelled: rate(board.cancelled, booked),
      confirmed: rate(board.everConfirmed, booked),
      newStuck: rate(board.newStuck, booked),
      pif: rate(closeKinds.pif, board.closes),
      split: rate(closeKinds.split, board.closes),
      deposit: rate(closeKinds.deposit, board.closes),
      installments: rate(closeKinds.installments, board.closes),
    },
  };
}
