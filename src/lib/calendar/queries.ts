import "server-only";

import { and, asc, eq, gte, isNull, lte, ne, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  actionItems,
  bookings,
  calendarFeedEvents,
  clients,
  teamMembers,
} from "@/db/schema/app";
import { dayEndIn, dayKeyIn, dayStartIn } from "@/lib/time/zone";
import { isSoftwareDevItem } from "@/lib/calendar/filter";

/** An action item shaped for the calendar — its date, scope, and who owns it. */
export interface CalendarItem {
  id: string;
  title: string;
  status: string;
  cadence: string;
  dueDate: string | null;
  clientName: string | null;
  clientSlug: string | null;
  assignee: string | null;
}

const selection = {
  id: actionItems.id,
  title: actionItems.title,
  status: actionItems.status,
  cadence: actionItems.cadence,
  dueDate: actionItems.dueDate,
  notes: actionItems.notes,
  clientName: clients.name,
  clientSlug: clients.slug,
  assignee: teamMembers.name,
  legacyAssignee: actionItems.assignee,
};

type Row = {
  id: string;
  title: string;
  status: string;
  cadence: string;
  dueDate: string | null;
  notes: string | null;
  clientName: string | null;
  clientSlug: string | null;
  assignee: string | null;
  legacyAssignee: string | null;
};

/** Drop internal GV OS / software-dev items, then shape for the calendar. */
const shape = (rows: Row[]): CalendarItem[] =>
  rows
    .filter((r) => !isSoftwareDevItem(r))
    .map(({ legacyAssignee, notes, ...r }) => {
      void notes; // read only for the dev-item filter above
      return { ...r, assignee: r.assignee ?? legacyAssignee };
    });

/**
 * Every action item due within [fromKey, toKey] (inclusive YYYY-MM-DD), plus
 * every undated item — cadence places those on the grid (see
 * lib/calendar/expand) — minus the internal software-dev backlog.
 */
export async function listCalendarItems(
  fromKey: string,
  toKey: string,
): Promise<CalendarItem[]> {
  try {
    const db = getDb();
    const rows = await db
      .select(selection)
      .from(actionItems)
      .leftJoin(clients, eq(actionItems.clientId, clients.id))
      .leftJoin(teamMembers, eq(actionItems.assigneeId, teamMembers.id))
      .where(
        and(
          // Dated items inside the window, plus UNDATED ones — their cadence
          // places them on the grid (lib/calendar/expand). An archived
          // client's work never paints the calendar.
          or(
            and(gte(actionItems.dueDate, fromKey), lte(actionItems.dueDate, toKey)),
            isNull(actionItems.dueDate),
          ),
          or(isNull(actionItems.clientId), ne(clients.status, "archived")),
        ),
      )
      .orderBy(asc(actionItems.dueDate));
    return shape(rows);
  } catch {
    return [];
  }
}

/** One timed thing on the calendar: a booked call or a calendar-feed meeting. */
export interface CalendarFeedEvent {
  id: string;
  /** A booked sales call (iClosed/Calendly) or a meeting from a calendar feed. */
  kind: "call" | "event";
  summary: string | null;
  dayKey: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  clientName: string | null;
  clientSlug: string | null;
}

/**
 * Mirrored calendar events inside [fromKey, toKey].
 *
 * Reads the mirror only — the pull is a sync job, so opening the calendar
 * never waits on Google and a feed that is down leaves yesterday's events in
 * place instead of emptying the month.
 */
export async function listCalendarFeedEvents(
  fromKey: string,
  toKey: string,
): Promise<CalendarFeedEvent[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: calendarFeedEvents.id,
        summary: calendarFeedEvents.summary,
        dayKey: calendarFeedEvents.dayKey,
        startsAt: calendarFeedEvents.startsAt,
        endsAt: calendarFeedEvents.endsAt,
        allDay: calendarFeedEvents.allDay,
        clientName: clients.name,
        clientSlug: clients.slug,
      })
      .from(calendarFeedEvents)
      .leftJoin(clients, eq(calendarFeedEvents.clientId, clients.id))
      .where(
        and(
          gte(calendarFeedEvents.dayKey, fromKey),
          lte(calendarFeedEvents.dayKey, toKey),
        ),
      )
      .orderBy(asc(calendarFeedEvents.startsAt));
    return rows.map((r) => ({ ...r, kind: "event" as const }));
  } catch {
    return [];
  }
}

/**
 * Booked calls inside [fromKey, toKey], from the schedulers that are already
 * syncing (iClosed, Calendly) — no new connection, no new credential.
 *
 * Cancelled bookings are left off: a call that is not happening does not hold
 * the hour. A reschedule's new time is its own row, so it still appears.
 * Bookings carry no day column, so each one is placed on its day in the
 * VIEWER's zone here — the same zone the grid is drawn in.
 */
export async function listCalendarBookings(
  fromKey: string,
  toKey: string,
  timeZone: string,
): Promise<CalendarFeedEvent[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: bookings.id,
        inviteeName: bookings.inviteeName,
        eventType: bookings.eventType,
        startsAt: bookings.startsAt,
        clientName: clients.name,
        clientSlug: clients.slug,
      })
      .from(bookings)
      .leftJoin(clients, eq(bookings.clientId, clients.id))
      .where(
        and(
          ne(bookings.status, "canceled"),
          gte(bookings.startsAt, dayStartIn(fromKey, timeZone)),
          lte(bookings.startsAt, dayEndIn(toKey, timeZone)),
          // An archived offer's calls never paint the calendar.
          or(isNull(bookings.clientId), ne(clients.status, "archived")),
        ),
      )
      .orderBy(asc(bookings.startsAt));

    return rows
      .filter((r): r is typeof r & { startsAt: Date } => r.startsAt !== null)
      .map((r) => ({
        id: `call:${r.id}`,
        kind: "call" as const,
        summary: r.inviteeName ?? r.eventType,
        dayKey: dayKeyIn(r.startsAt, timeZone),
        startsAt: r.startsAt,
        endsAt: null,
        allDay: false,
        clientName: r.clientName,
        clientSlug: r.clientSlug,
      }));
  } catch {
    return [];
  }
}
