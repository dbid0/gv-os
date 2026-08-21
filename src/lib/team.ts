import "server-only";

import { asc, eq, ne, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { actionItems, clients, teamMembers } from "@/db/schema/app";

/** A roster row shaped for the team page. */
export interface TeamMemberRow {
  id: string;
  name: string;
  role: string;
  email: string | null;
  status: string;
  clientId: string | null;
  clientName: string | null;
  notes: string | null;
  /** Assigned action items not yet completed — the member's live workload. */
  openActions: number;
}

/** The full roster with each member's open-action workload. */
export async function listTeamMembers(): Promise<TeamMemberRow[]> {
  const db = getDb();
  const open = db
    .select({
      assigneeId: actionItems.assigneeId,
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(actionItems)
    .where(ne(actionItems.status, "completed"))
    .groupBy(actionItems.assigneeId)
    .as("open");

  return db
    .select({
      id: teamMembers.id,
      name: teamMembers.name,
      role: teamMembers.role,
      email: teamMembers.email,
      status: teamMembers.status,
      clientId: teamMembers.clientId,
      clientName: clients.name,
      notes: teamMembers.notes,
      openActions: sql<number>`coalesce(${open.count}, 0)`,
    })
    .from(teamMembers)
    .leftJoin(clients, eq(teamMembers.clientId, clients.id))
    .leftJoin(open, eq(open.assigneeId, teamMembers.id))
    .orderBy(asc(teamMembers.name));
}

/** Active members only, for assignee pickers. */
export async function listActiveMembers(): Promise<
  { id: string; name: string; role: string }[]
> {
  const db = getDb();
  return db
    .select({ id: teamMembers.id, name: teamMembers.name, role: teamMembers.role })
    .from(teamMembers)
    .where(eq(teamMembers.status, "active"))
    .orderBy(asc(teamMembers.name));
}
