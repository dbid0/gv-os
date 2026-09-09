import { and, asc, eq, gt } from "drizzle-orm";
import { CalendarClock, CheckCircle2 } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { getDb } from "@/db/client";
import { bookings } from "@/db/schema/app";
import { confirmedBeforeCall } from "@/lib/crm/confirmation";
import { confirmBooking } from "@/lib/crm/confirmation-actions";
import { listConfirmations } from "@/lib/crm/confirmation-store";

/**
 * Upcoming calls with the confirm action — the floor's pre-call queue.
 * Confirming here is what feeds every confirmed-vs-unconfirmed number: the
 * timestamp is now, so it only ever counts when the call is still ahead
 * (the strictly-before rule lives in the engine, not here). Admin surface
 * only — the caller gates it away from the portal.
 */
export async function UpcomingCalls({
  clientId,
  slug,
  now,
}: {
  clientId: string;
  slug: string;
  now: Date;
}) {
  const db = getDb();
  const [rows, confirmations] = await Promise.all([
    db
      .select({
        id: bookings.id,
        inviteeName: bookings.inviteeName,
        inviteeEmail: bookings.inviteeEmail,
        startsAt: bookings.startsAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.clientId, clientId),
          eq(bookings.status, "booked"),
          gt(bookings.startsAt, now),
        ),
      )
      .orderBy(asc(bookings.startsAt))
      .limit(8),
    listConfirmations(clientId),
  ]);
  if (rows.length === 0) return null;

  const confirmedAt = new Map(confirmations.map((c) => [c.bookingId, c.confirmedAt]));
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

  return (
    <Panel title="Upcoming calls">
      <p className="text-faint mb-2 text-xs">
        Confirm each call before it starts — confirmations recorded after the call never
        count.
      </p>
      <ul className="divide-y">
        {rows.map((b) => {
          const isConfirmed = confirmedBeforeCall(
            confirmedAt.get(b.id) ?? null,
            b.startsAt,
          );
          return (
            <li key={b.id} className="flex items-center gap-3 py-2.5">
              <CalendarClock className="text-faint size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm font-medium">
                  {b.inviteeName ?? b.inviteeEmail ?? "Unknown invitee"}
                </span>
                <span className="text-faint block text-xs">
                  {b.startsAt ? fmt.format(b.startsAt) : "unscheduled"}
                </span>
              </span>
              {isConfirmed ? (
                <span className="text-success flex items-center gap-1.5 text-xs font-medium">
                  <CheckCircle2 className="size-3.5" /> Confirmed
                </span>
              ) : (
                <form action={confirmBooking} className="flex items-center gap-2">
                  <input type="hidden" name="bookingId" value={b.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <select
                    name="role"
                    defaultValue="setter"
                    className="bg-secondary/60 text-foreground rounded-md border px-2 py-1 text-xs"
                    aria-label="Who confirmed"
                  >
                    <option value="setter">Setter</option>
                    <option value="dialer">Dialer</option>
                    <option value="dm_setter">DM setter</option>
                  </select>
                  <button
                    type="submit"
                    className="bg-secondary hover:bg-secondary/70 text-foreground press rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                  >
                    Confirm
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
