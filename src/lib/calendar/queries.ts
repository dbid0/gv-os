import "server-only";

import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";

import { getDb } from "@/db/client";
import { actionItems, clients, teamMembers } from "@/db/schema/app";
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
 * Every action item due within [fromKey, toKey] (inclusive YYYY-MM-DD), minus
 * the internal software-dev backlog. Undated items are intentionally left off
 * the calendar — they live on the Work board until someone schedules them.
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
      .where(and(gte(actionItems.dueDate, fromKey), lte(actionItems.dueDate, toKey)))
      .orderBy(asc(actionItems.dueDate));
    return shape(rows);
  } catch {
    return [];
  }
}
