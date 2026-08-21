import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { actionItems, clients, teamMembers } from "@/db/schema/app";
import { assigneeDisplay } from "@/lib/team-roles";

/** An action-list item shaped for the board. */
export interface ActionItemRow {
  id: string;
  title: string;
  cadence: string;
  status: string;
  dueDate: string | null;
  /** Display name: the roster member, or the legacy free-text name. */
  assignee: string | null;
  assigneeId: string | null;
  clientId: string | null;
  teamName: string | null;
  notes: string | null;
}

/** Every action item, newest-relevant first. The board filters by cadence. */
export async function listActionItems(): Promise<ActionItemRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: actionItems.id,
      title: actionItems.title,
      cadence: actionItems.cadence,
      status: actionItems.status,
      dueDate: actionItems.dueDate,
      legacyAssignee: actionItems.assignee,
      assigneeId: actionItems.assigneeId,
      memberName: teamMembers.name,
      clientId: actionItems.clientId,
      teamName: clients.name,
      notes: actionItems.notes,
    })
    .from(actionItems)
    .leftJoin(clients, eq(actionItems.clientId, clients.id))
    .leftJoin(teamMembers, eq(actionItems.assigneeId, teamMembers.id))
    .orderBy(asc(actionItems.dueDate), desc(actionItems.createdAt));

  return rows.map(({ legacyAssignee, memberName, ...row }) => ({
    ...row,
    assignee: assigneeDisplay(memberName, legacyAssignee),
  }));
}
