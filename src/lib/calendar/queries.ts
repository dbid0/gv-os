import "server-only";

import { and, asc, desc, eq, gte, isNull, lte, ne, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  actionItems,
  calendarFeedEvents,
  clients,
  integrations,
  teamMembers,
} from "@/db/schema/app";
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

/** One meeting from a connected calendar feed, ready to place on a day. */
export interface CalendarFeedEvent {
  id: string;
  summary: string | null;
  dayKey: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  clientName: string | null;
  clientSlug: string | null;
}

/** Whether any calendar feed is connected, and when it last landed. */
export interface CalendarFeedStatus {
  connected: boolean;
  lastSyncAt: Date | null;
  lastSyncNote: string | null;
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
    return rows;
  } catch {
    return [];
  }
}

/** The feed's own state, so the page can say where its events came from. */
export async function calendarFeedStatus(): Promise<CalendarFeedStatus> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        lastSyncAt: integrations.lastSyncAt,
        lastSyncNote: integrations.lastSyncNote,
      })
      .from(integrations)
      .where(
        and(eq(integrations.provider, "gcal"), eq(integrations.status, "connected")),
      )
      .orderBy(desc(integrations.lastSyncAt))
      .limit(1);
    const row = rows[0];
    return {
      connected: rows.length > 0,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastSyncNote: row?.lastSyncNote ?? null,
    };
  } catch {
    return { connected: false, lastSyncAt: null, lastSyncNote: null };
  }
}
