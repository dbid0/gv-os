/**
 * THE CALL LOG — every booked call on an offer, with what's known about it.
 *
 * One row per booking from the counted calendar: when it is, whether it was
 * confirmed in time, and — once it has happened — what the end-of-call report
 * says. A filed-in-GV-OS report wins over a sheet row for the same call, since
 * it was filed against that exact booking; otherwise the sheet's report is
 * matched by the same email-and-time rule the confirmation rates use, so the
 * log and the rates can never disagree about a call.
 *
 * Pure: now is passed in, no database.
 */

import { confirmedBeforeCall } from "@/lib/crm/confirmation";
import {
  readEocOutcome,
  reportForBooking,
  type EocOutcome,
  type EocReport,
} from "@/lib/crm/confirmation-rates";
import { cleanCancelReason, rescheduleTrail } from "@/lib/calls/reschedules";
import { dayKeyIn } from "@/lib/time/zone";

export type CallLogBooking = {
  id: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  startsAt: Date | null;
  status: string;
  eventType: string | null;
  provider: string;
  /** The booking moved to another time (a cancelled row that moved, or a moved booking). */
  rescheduled?: boolean;
  /** When the booking was made — pairs a reschedule with the booking it became. */
  bookedAt?: Date | null;
  /** The calendar's own cancellation reason, as recorded. */
  cancelReason?: string | null;
};

/** An in-app report tied to the booking it was filed against. */
export type FiledReport = EocReport & { bookingId: string | null };

export type CallState = "upcoming" | "needs_outcome" | "reported" | "cancelled";

export type ConfirmationState = "in_time" | "after_start" | "none";

export type CallLogRow = {
  bookingId: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  startsAt: Date | null;
  eventType: string | null;
  provider: string;
  /** Moved to another time — a cancelled row here is a reschedule, not a no. */
  rescheduled: boolean;
  state: CallState;
  confirmation: ConfirmationState;
  /** Which seat confirmed (setter · dialer · dm_setter), when a confirmation says. */
  confirmedRole: string | null;
  /** What the report says happened, or null with no usable report. */
  outcome: EocOutcome | null;
  /** The report's own words, for display. */
  outcomeWords: string | null;
  /** Where the report came from. */
  reportSource: "app" | "sheet" | null;
  /** The closer the report names, or null. */
  closer: string | null;
  /** The setter the report names, or null. */
  setter: string | null;
  /** How the close paid, in the report's words; null off a close or unstated. */
  closeType: string | null;
  /** Cash the report says was collected on the call (a report, not money). */
  reportedCashCents: number | null;
  /** Contract value the report states (a report, not money). */
  reportedRevenueCents: number | null;
  /** Why the calendar says it was called off, when it says. */
  cancelReason: string | null;
  /** A rescheduled call: the new time it moved to, when that booking is known. */
  movedTo: Date | null;
  /** A call that replaced a rescheduled one: the time it moved from. */
  movedFrom: Date | null;
};

export const CALL_STATES: readonly { key: CallState; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "needs_outcome", label: "Needs an outcome" },
  { key: "reported", label: "Reported" },
  { key: "cancelled", label: "Cancelled" },
];

/** Grace before a just-ended call counts as needing an outcome (matches stuck calls). */
const GRACE_MS = 60 * 60 * 1000;

function confirmationStateOf(
  confirmedAt: Date | null,
  startsAt: Date | null,
): ConfirmationState {
  if (!confirmedAt) return "none";
  return confirmedBeforeCall(confirmedAt, startsAt) ? "in_time" : "after_start";
}

const byEmail = (reports: EocReport[]): Map<string, EocReport[]> => {
  const map = new Map<string, EocReport[]>();
  for (const r of reports) {
    const email = r.email?.trim().toLowerCase();
    if (!email) continue;
    map.set(email, [...(map.get(email) ?? []), r]);
  }
  return map;
};

export function buildCallLog(input: {
  bookings: CallLogBooking[];
  confirmations: {
    bookingId: string;
    confirmedAt: Date | null;
    confirmedRole?: string | null;
  }[];
  /** Reports filed in GV OS, with the booking each was filed against. */
  filed: FiledReport[];
  /** Reports from the tracking sheet. */
  sheet: EocReport[];
  now: Date;
}): CallLogRow[] {
  const confirmedAt = new Map<string, Date | null>();
  const confirmedRole = new Map<string, string | null>();
  for (const c of input.confirmations) {
    confirmedAt.set(c.bookingId, c.confirmedAt);
    confirmedRole.set(c.bookingId, c.confirmedRole?.trim() || null);
  }
  const filedByBooking = new Map<string, FiledReport>();
  for (const r of input.filed) if (r.bookingId) filedByBooking.set(r.bookingId, r);
  const unboundFiled = byEmail(input.filed.filter((r) => !r.bookingId));
  const sheetByEmail = byEmail(input.sheet);
  const nowMs = input.now.getTime();
  const trail = rescheduleTrail(input.bookings);

  const rows: CallLogRow[] = input.bookings.map((b) => {
    const base = {
      bookingId: b.id,
      inviteeName: b.inviteeName,
      inviteeEmail: b.inviteeEmail,
      startsAt: b.startsAt,
      eventType: b.eventType,
      provider: b.provider,
      rescheduled: b.rescheduled === true,
      confirmation: confirmationStateOf(confirmedAt.get(b.id) ?? null, b.startsAt),
      confirmedRole: confirmedRole.get(b.id) ?? null,
      cancelReason: b.status === "canceled" ? cleanCancelReason(b.cancelReason) : null,
      movedTo: trail.get(b.id)?.movedTo?.startsAt ?? null,
      movedFrom: trail.get(b.id)?.movedFrom?.startsAt ?? null,
    };

    // A report filed against this booking, else one filed without a booking,
    // else the sheet's — each read the same way.
    const boundReport = filedByBooking.get(b.id) ?? null;
    const appReport = boundReport ?? reportForBooking(b, unboundFiled);
    const sheetReport = appReport ? null : reportForBooking(b, sheetByEmail);
    const report = appReport ?? sheetReport;
    const outcome = report ? readEocOutcome(report.status, report.outcome) : null;
    const reportFields = {
      outcome,
      outcomeWords: report ? (report.status ?? report.outcome) : null,
      reportSource: appReport
        ? ("app" as const)
        : sheetReport
          ? ("sheet" as const)
          : null,
      closer: report?.rep?.trim() || null,
      setter: report?.setter?.trim() || null,
      closeType: report?.closeType?.trim() || null,
      reportedCashCents: report?.cashCents ?? null,
      reportedRevenueCents: report?.revenueCents ?? null,
    };

    if (b.status === "canceled") {
      return { ...base, state: "cancelled" as const, ...reportFields };
    }
    if (outcome !== null) {
      return { ...base, state: "reported" as const, ...reportFields };
    }
    const started = b.startsAt !== null && b.startsAt.getTime() <= nowMs - GRACE_MS;
    return {
      ...base,
      state: started ? ("needs_outcome" as const) : ("upcoming" as const),
      ...reportFields,
    };
  });

  // Upcoming soonest first; everything else most recent first; undated last.
  return rows.sort((a, b) => {
    if (!a.startsAt || !b.startsAt) {
      if (a.startsAt === b.startsAt) return a.bookingId.localeCompare(b.bookingId);
      return a.startsAt ? -1 : 1;
    }
    if (a.state === "upcoming" && b.state === "upcoming") {
      return a.startsAt.getTime() - b.startsAt.getTime();
    }
    return b.startsAt.getTime() - a.startsAt.getTime();
  });
}

export function countByState(rows: CallLogRow[]): Record<CallState, number> {
  const counts: Record<CallState, number> = {
    upcoming: 0,
    needs_outcome: 0,
    reported: 0,
    cancelled: 0,
  };
  for (const r of rows) counts[r.state] += 1;
  return counts;
}

/** The viewer's calendar day a call starts on, YYYY-MM-DD. */
export const callDayKey = (d: Date, timeZone: string): string => dayKeyIn(d, timeZone);

export type CallDay = { key: string; rows: CallLogRow[] };

/** Group rows by the viewer's calendar day, keeping row order; undated → "undated". */
export function groupByDay(rows: CallLogRow[], timeZone: string): CallDay[] {
  const days: CallDay[] = [];
  const index = new Map<string, CallDay>();
  for (const r of rows) {
    const key = r.startsAt ? dayKeyIn(r.startsAt, timeZone) : "undated";
    let day = index.get(key);
    if (!day) {
      day = { key, rows: [] };
      index.set(key, day);
      days.push(day);
    }
    day.rows.push(r);
  }
  return days;
}
