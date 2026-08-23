import "server-only";

import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, teamMembers } from "@/db/schema/app";

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
}

/** The full roster, each member with their lane resolved. */
export async function listTeamMembers(): Promise<TeamMemberRow[]> {
  const db = getDb();
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
    })
    .from(teamMembers)
    .leftJoin(clients, eq(teamMembers.clientId, clients.id))
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

/** One member with their lane resolved, or null. */
export async function getTeamMember(id: string) {
  const db = getDb();
  const [member] = await db
    .select({
      id: teamMembers.id,
      name: teamMembers.name,
      role: teamMembers.role,
      email: teamMembers.email,
      status: teamMembers.status,
      clientName: clients.name,
      notes: teamMembers.notes,
    })
    .from(teamMembers)
    .leftJoin(clients, eq(teamMembers.clientId, clients.id))
    .where(eq(teamMembers.id, id))
    .limit(1);
  return member ?? null;
}
