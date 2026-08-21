import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { actionItems, clients } from "@/db/schema/app";

/** An action-list item shaped for the board. */
export interface ActionItemRow {
  id: string;
  title: string;
  cadence: string;
  status: string;
  dueDate: string | null;
  assignee: string | null;
  clientId: string | null;
  teamName: string | null;
  notes: string | null;
}

/** Every action item, newest-relevant first. The board filters by cadence. */
export async function listActionItems(): Promise<ActionItemRow[]> {
  const db = getDb();
  return db
    .select({
      id: actionItems.id,
      title: actionItems.title,
      cadence: actionItems.cadence,
      status: actionItems.status,
      dueDate: actionItems.dueDate,
      assignee: actionItems.assignee,
      clientId: actionItems.clientId,
      teamName: clients.name,
      notes: actionItems.notes,
    })
    .from(actionItems)
    .leftJoin(clients, eq(actionItems.clientId, clients.id))
    .orderBy(asc(actionItems.dueDate), desc(actionItems.createdAt));
}
