import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { bookings, clientTrackingRows } from "@/db/schema/app";
import { filterCountedBookings } from "@/lib/bookings/counted";
import {
  buildCallLog,
  countByState,
  type CallLogRow,
  type CallState,
} from "@/lib/calls/call-log";
import { activeFiledReports } from "@/lib/calls/eoc-store";
import { listConfirmations } from "@/lib/crm/confirmation-store";
import { currentSnapshot } from "@/lib/tracking/queries";

export type CallLogData = {
  /** Every booking this offer has, counted or not — "has a calendar at all". */
  totalBookings: number;
  log: CallLogRow[];
  counts: Record<CallState, number>;
};

/**
 * One offer's call log: counted-calendar bookings, their confirmations, the
 * reports filed in GV OS and the sheet's end-of-call rows, assembled by the one
 * pure builder. The Calls page and the MCP server both read through here, so
 * they can't describe the same calls differently.
 */
export async function loadCallLog(
  clientId: string,
  countedCallSources: string[] | null,
  now: Date,
): Promise<CallLogData> {
  const db = getDb();
  const snapshot = await currentSnapshot(clientId);
  const [bookingRows, confirmations, filed, sheet] = await Promise.all([
    db
      .select({
        id: bookings.id,
        inviteeName: bookings.inviteeName,
        inviteeEmail: bookings.inviteeEmail,
        startsAt: bookings.startsAt,
        status: bookings.status,
        eventType: bookings.eventType,
        provider: bookings.provider,
        rescheduled: bookings.rescheduled,
        bookedAt: bookings.bookedAt,
        // Calendly keeps it on the event's cancellation; iClosed as cancelReason.
        cancelReason: sql<
          string | null
        >`coalesce(${bookings.raw} -> 'cancellation' ->> 'reason', ${bookings.raw} ->> 'cancelReason')`,
      })
      .from(bookings)
      .where(eq(bookings.clientId, clientId))
      // The newest 1000 by start: without an order the cap kept an arbitrary
      // 1000, which could drop this week's calls on a busy offer.
      .orderBy(sql`${bookings.startsAt} desc nulls last`)
      .limit(1000),
    listConfirmations(clientId),
    activeFiledReports(clientId),
    snapshot
      ? db
          .select({
            email: clientTrackingRows.email,
            status: clientTrackingRows.status,
            outcome: clientTrackingRows.outcome,
            occurredAt: clientTrackingRows.occurredAt,
            rep: clientTrackingRows.rep,
          })
          .from(clientTrackingRows)
          .where(
            and(
              eq(clientTrackingRows.syncId, snapshot.syncId),
              eq(clientTrackingRows.tab, "eoc"),
            ),
          )
      : Promise.resolve([]),
  ]);

  const counted = filterCountedBookings(bookingRows, countedCallSources);
  const log = buildCallLog({ bookings: counted, confirmations, filed, sheet, now });
  return { totalBookings: bookingRows.length, log, counts: countByState(log) };
}
