import "server-only";

import { and, asc, desc, eq, gte, isNull, lte, ne } from "drizzle-orm";

import { getDb } from "@/db/client";
import { actionItems, clients, teamMembers } from "@/db/schema/app";

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
  clientName: string | null;
  clientSlug: string | null;
  assignee: string | null;
  legacyAssignee: string | null;
};

const shape = (rows: Row[]): CalendarItem[] =>
  rows.map(({ legacyAssignee, ...r }) => ({
    ...r,
    assignee: r.assignee ?? legacyAssignee,
  }));

/** Every action item due within [fromKey, toKey] (inclusive YYYY-MM-DD). */
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

/** Open items with no due date — the backlog that hasn't been scheduled yet. */
export async function listUnscheduledItems(): Promise<CalendarItem[]> {
  try {
    const db = getDb();
    const rows = await db
      .select(selection)
      .from(actionItems)
      .leftJoin(clients, eq(actionItems.clientId, clients.id))
      .leftJoin(teamMembers, eq(actionItems.assigneeId, teamMembers.id))
      .where(and(isNull(actionItems.dueDate), ne(actionItems.status, "completed")))
      .orderBy(desc(actionItems.createdAt))
      .limit(50);
    return shape(rows);
  } catch {
    return [];
  }
}
