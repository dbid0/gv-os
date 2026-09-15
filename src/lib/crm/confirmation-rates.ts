/**
 * DOES CONFIRMING A CALL WORK? — show and close rates, confirmed vs not.
 *
 * The reason a setter confirms a call is that confirmed calls show up and buy
 * more often. That claim is only worth anything measured: this splits every
 * held call into "confirmed before it started" and "not", then reads each
 * call's end-of-call report for what actually happened.
 *
 * Honesty rules, each tested:
 * - A confirmation counts only when recorded BEFORE the call's start
 *   (`splitByConfirmation` owns that rule; this module reuses it).
 * - A call is HELD once its start has passed and it wasn't cancelled.
 * - Only held calls WITH a report enter a rate. A past call nobody reported on
 *   is counted apart as unreported — never quietly a no-show, never a show.
 * - Show rate = shows ÷ (shows + no-shows). Close rate = closes ÷ shows.
 *   A rate with a zero denominator is null ("—"), never 0%.
 * - A report that says the call was rescheduled or cancelled means the call
 *   was not held; it leaves the rates entirely rather than counting as a miss.
 *
 * Pure: no clock (now is passed in), no database.
 */

import { readCallResult } from "@/lib/calls/review";
import {
  splitByConfirmation,
  type ConfirmableCall,
  type ConfirmationRecord,
} from "@/lib/crm/confirmation";

/** What one end-of-call report says happened on the call. */
export type EocOutcome = "closed" | "showed" | "no_show" | "not_held";

/** One end-of-call report row, as the tracking sheet mirror carries it. */
export type EocReport = {
  email: string | null;
  status: string | null;
  outcome: string | null;
  occurredAt: Date | null;
  /** Who ran the call, when the report names them. */
  rep?: string | null;
  /** Who set the call, when the report names them. */
  setter?: string | null;
  /** How the close paid, in the report's own words (pif, split, deposit…). */
  closeType?: string | null;
  /** Cash the closer reported collecting on the call — a report, never money. */
  cashCents?: number | null;
  /** Contract value the closer reported — a report, never money. */
  revenueCents?: number | null;
};

/** A booking with the invitee identity needed to find its report. */
export type RateableBooking = ConfirmableCall & { inviteeEmail: string | null };

export type GroupRates = {
  /** Calls whose start passed without a cancellation. */
  held: number;
  /** Held calls with an end-of-call report that says what happened. */
  reported: number;
  shows: number;
  noShows: number;
  closes: number;
  /** shows ÷ (shows + noShows), 0–100, or null with nothing to divide by. */
  showRate: number | null;
  /** closes ÷ shows, 0–100, or null with no shows. */
  closeRate: number | null;
};

export type ConfirmationRates = {
  confirmed: GroupRates;
  unconfirmed: GroupRates;
  /** Held calls (either group) with no usable report — outside every rate. */
  unreported: number;
};

const NO_SHOW = /(no.?show|didn.?t show|did not show|ghost)/;
const NOT_HELD = /(reschedul|cancel)/;

/**
 * Read a report's words into an outcome, or null when it says nothing usable.
 * The closer's status wins; the separate outcome column is read when the
 * status is empty. A no-show is checked before "lost" because readCallResult
 * files a no-show under lost.
 */
export function readEocOutcome(
  status: string | null | undefined,
  outcome: string | null | undefined,
): EocOutcome | null {
  const words = [status, outcome]
    .map((w) => (w ?? "").trim().toLowerCase())
    .find((w) => w.length > 0);
  if (!words) return null;
  if (NO_SHOW.test(words)) return "no_show";
  if (NOT_HELD.test(words)) return "not_held";
  if (readCallResult(words) === "won") return "closed";
  // Any other stated result (lost, follow-up, not a fit…) means the prospect
  // was on the call.
  return "showed";
}

/** Reports filed this long before a call's start still count for it (a closer
 *  pre-filling the form); anything earlier belongs to an earlier call. */
const EARLY_SLACK_MS = 12 * 60 * 60 * 1000;

/**
 * The report for one booking: same invitee email, filed no earlier than just
 * before the call, the earliest such report winning (the next call's report
 * must not overwrite this one). An undated report can only stand in when the
 * invitee has no dated report at all.
 */
export function reportForBooking(
  booking: RateableBooking,
  reportsByEmail: Map<string, EocReport[]>,
): EocReport | null {
  const email = booking.inviteeEmail?.trim().toLowerCase();
  if (!email) return null;
  const reports = reportsByEmail.get(email);
  if (!reports || reports.length === 0) return null;

  const dated = reports.filter((r) => r.occurredAt !== null);
  if (dated.length === 0) return reports[reports.length - 1];
  if (!booking.startsAt) return null;

  const floor = booking.startsAt.getTime() - EARLY_SLACK_MS;
  let best: EocReport | null = null;
  for (const r of dated) {
    const t = (r.occurredAt as Date).getTime();
    if (t < floor) continue;
    if (!best || t < (best.occurredAt as Date).getTime()) best = r;
  }
  return best;
}

function emptyGroup(): GroupRates {
  return {
    held: 0,
    reported: 0,
    shows: 0,
    noShows: 0,
    closes: 0,
    showRate: null,
    closeRate: null,
  };
}

const rate = (num: number, den: number): number | null =>
  den === 0 ? null : (num / den) * 100;

export function confirmationRates(
  bookings: RateableBooking[],
  confirmations: ConfirmationRecord[],
  reports: EocReport[],
  now: Date,
): ConfirmationRates {
  const byEmail = new Map<string, EocReport[]>();
  for (const r of reports) {
    const email = r.email?.trim().toLowerCase();
    if (!email) continue;
    const list = byEmail.get(email) ?? [];
    list.push(r);
    byEmail.set(email, list);
  }

  const split = splitByConfirmation(bookings, confirmations, now);
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const result: ConfirmationRates = {
    confirmed: emptyGroup(),
    unconfirmed: emptyGroup(),
    unreported: 0,
  };

  const tally = (calls: ConfirmableCall[], group: GroupRates) => {
    for (const call of calls) {
      if (call.status === "canceled" || !call.startsAt) continue;
      if (call.startsAt.getTime() > now.getTime()) continue;
      const booking = byId.get(call.id) as RateableBooking;
      const report = reportForBooking(booking, byEmail);
      const outcome = report ? readEocOutcome(report.status, report.outcome) : null;
      if (outcome === "not_held") continue;
      group.held += 1;
      if (outcome === null) {
        result.unreported += 1;
        continue;
      }
      group.reported += 1;
      if (outcome === "no_show") {
        group.noShows += 1;
        continue;
      }
      group.shows += 1;
      if (outcome === "closed") group.closes += 1;
    }
    group.showRate = rate(group.shows, group.shows + group.noShows);
    group.closeRate = rate(group.closes, group.shows);
  };

  tally(split.confirmed, result.confirmed);
  tally(split.unconfirmed, result.unconfirmed);
  return result;
}

/**
 * The difference confirming makes, in percentage points, or null unless BOTH
 * groups have a rate. Positive = confirmed calls do better.
 */
export function confirmationLift(
  confirmed: number | null,
  unconfirmed: number | null,
): number | null {
  if (confirmed === null || unconfirmed === null) return null;
  return confirmed - unconfirmed;
}
