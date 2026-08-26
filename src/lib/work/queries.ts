import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";

import { getDb } from "@/db/client";
import { actionItems, clients, teamMembers } from "@/db/schema/app";

export interface WorkItem {
  id: string;
  title: string;
  status: string;
  cadence: string;
  dueDate: string | null;
  clientId: string | null;
  clientName: string | null;
  clientSlug: string | null;
  assigneeId: string | null;
  assignee: string | null;
  notes: string | null;
}

/** Every work item (action item), newest first, shaped for the team board. */
export async function listWorkItems(): Promise<WorkItem[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: actionItems.id,
        title: actionItems.title,
        status: actionItems.status,
        cadence: actionItems.cadence,
        dueDate: actionItems.dueDate,
        clientId: actionItems.clientId,
        clientName: clients.name,
        clientSlug: clients.slug,
        assigneeId: actionItems.assigneeId,
        assignee: teamMembers.name,
        legacyAssignee: actionItems.assignee,
        notes: actionItems.notes,
      })
      .from(actionItems)
      .leftJoin(clients, eq(actionItems.clientId, clients.id))
      .leftJoin(teamMembers, eq(actionItems.assigneeId, teamMembers.id))
      .orderBy(desc(actionItems.createdAt))
      .limit(500);
    return rows.map(({ legacyAssignee, ...r }) => ({
      ...r,
      assignee: r.assignee ?? legacyAssignee,
    }));
  } catch {
    return [];
  }
}

export interface WorkMember {
  id: string;
  name: string;
  clientId: string | null;
}

/** Active team members, for assigning work. */
export async function listWorkMembers(): Promise<WorkMember[]> {
  try {
    const db = getDb();
    return await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        clientId: teamMembers.clientId,
      })
      .from(teamMembers)
      .where(and(eq(teamMembers.status, "active"), ne(teamMembers.name, "")))
      .orderBy(teamMembers.name);
  } catch {
    return [];
  }
}
