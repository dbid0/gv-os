"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { teamMembers } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import {
  MEMBER_SUBTYPE_VALUES,
  PLATFORM_ROLE_VALUES,
  REP_KIND_VALUES,
  assertManagerMayWrite,
  memberRoleColumns,
  platformRoleOf,
} from "@/lib/team-roles";

/**
 * Who may write the roster, and how far.
 *
 * Server actions are the security boundary (the viewer-role cookie only hides
 * chrome), so the ROLE check lives here, on the REAL role — a preview cookie
 * must never grant rights. Before this, any allowlisted sign-in could call
 * createTeamMember and mint themselves an admin.
 *
 *   - admin: everything.
 *   - sales_manager: may add/edit/deactivate SALES REPS, and only in a lane
 *     they run — their own client lane, or any lane when they are agency-wide
 *     (no client). Managers staff their floor; they do not mint admins.
 *   - everyone else: no roster writes.
 */
interface RosterWriter {
  role: "admin" | "sales_manager";
  /** Manager's lane; null = agency-wide. Meaningless for admins. */
  clientId: string | null;
}

async function requireRosterWriter(): Promise<RosterWriter> {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return { role: "admin", clientId: null };
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");

  const db = getDb();
  const email = user.email.trim().toLowerCase();
  const rows = await db
    .select({
      role: teamMembers.role,
      roleKey: teamMembers.roleKey,
      repKind: teamMembers.repKind,
      clientId: teamMembers.clientId,
    })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.status, "active"),
        eq(sql`lower(${teamMembers.email})`, email),
      ),
    );

  // Unmapped allowlisted emails are the owners — admin, same rule as
  // resolve-role. A mapped member takes their strongest active row.
  if (rows.length === 0) return { role: "admin", clientId: null };
  let best: RosterWriter | null = null;
  for (const r of rows) {
    const platform = platformRoleOf(r);
    if (platform === "admin") return { role: "admin", clientId: null };
    if (platform === "sales_manager") {
      best = best ?? { role: "sales_manager", clientId: r.clientId };
      if (r.clientId === null) best = { role: "sales_manager", clientId: null };
    }
  }
  if (!best) throw new Error("Not authorized to manage the roster.");
  return best;
}

/** The role fields the add/edit form collects, shared by create and update. */
const roleInput = z.object({
  platformRole: z.enum(PLATFORM_ROLE_VALUES),
  repKind: z.enum(REP_KIND_VALUES).nullable().optional(),
  subtype: z.enum(MEMBER_SUBTYPE_VALUES).nullable().optional(),
});

const detailInput = z.object({
  name: z.string().min(1, "A member needs a name."),
  email: z.string().email().optional().or(z.literal("")),
  clientId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});

const createInput = roleInput.and(detailInput);

export async function createTeamMember(raw: z.input<typeof createInput>) {
  const writer = await requireRosterWriter();
  const input = createInput.parse(raw);
  assertManagerMayWrite(writer, {
    platformRole: input.platformRole,
    clientId: input.clientId ?? null,
  });
  const cols = memberRoleColumns({
    platformRole: input.platformRole,
    repKind: input.repKind ?? null,
    subtype: input.subtype ?? null,
  });
  const db = getDb();
  const [member] = await db
    .insert(teamMembers)
    .values({
      name: input.name.trim(),
      role: cols.role,
      roleKey: cols.roleKey,
      repKind: cols.repKind,
      email: input.email?.trim() || null,
      clientId: input.clientId ?? null,
      notes: input.notes?.trim() || null,
    })
    .returning();
  revalidatePath("/team");
  return { id: member.id };
}

const updateInput = z.object({ id: z.string().uuid() }).and(roleInput).and(detailInput);

/** The target row's platform role + lane, for the manager checks. */
async function loadTargetShape(memberId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      role: teamMembers.role,
      roleKey: teamMembers.roleKey,
      repKind: teamMembers.repKind,
      clientId: teamMembers.clientId,
    })
    .from(teamMembers)
    .where(eq(teamMembers.id, memberId))
    .limit(1);
  if (!row) throw new Error("No such member.");
  return { platformRole: platformRoleOf(row), clientId: row.clientId };
}

export async function updateTeamMember(raw: z.input<typeof updateInput>) {
  const writer = await requireRosterWriter();
  const input = updateInput.parse(raw);
  if (writer.role !== "admin") {
    // Both the row as it IS and as it WOULD BECOME must be inside the
    // manager's remit — otherwise a manager could seize an admin row by
    // "updating" it into a rep, or promote a rep out of their lane.
    assertManagerMayWrite(writer, await loadTargetShape(input.id));
    assertManagerMayWrite(writer, {
      platformRole: input.platformRole,
      clientId: input.clientId ?? null,
    });
  }
  const cols = memberRoleColumns({
    platformRole: input.platformRole,
    repKind: input.repKind ?? null,
    subtype: input.subtype ?? null,
  });
  const db = getDb();
  await db
    .update(teamMembers)
    .set({
      name: input.name.trim(),
      role: cols.role,
      roleKey: cols.roleKey,
      repKind: cols.repKind,
      email: input.email?.trim() || null,
      clientId: input.clientId ?? null,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(teamMembers.id, input.id));
  revalidatePath("/team");
  revalidatePath(`/team/${input.id}`);
  return { ok: true };
}

/** Link a member to their sales rep record (or pass null to unlink). */
export async function linkMemberToRep(id: string, repId: string | null) {
  const writer = await requireRosterWriter();
  const memberId = z.string().uuid().parse(id);
  if (writer.role !== "admin") {
    assertManagerMayWrite(writer, await loadTargetShape(memberId));
  }
  const rep = repId === null ? null : z.string().uuid().parse(repId);
  const db = getDb();
  await db
    .update(teamMembers)
    .set({ repId: rep, updatedAt: new Date() })
    .where(eq(teamMembers.id, memberId));
  revalidatePath("/team");
  revalidatePath(`/team/${memberId}`);
  return { ok: true };
}

export async function setTeamMemberStatus(id: string, status: string) {
  const writer = await requireRosterWriter();
  const memberId = z.string().uuid().parse(id);
  if (writer.role !== "admin") {
    assertManagerMayWrite(writer, await loadTargetShape(memberId));
  }
  const next = z.enum(["active", "inactive"]).parse(status);
  const db = getDb();
  await db
    .update(teamMembers)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(teamMembers.id, memberId));
  revalidatePath("/team");
  revalidatePath(`/team/${memberId}`);
  return { ok: true };
}
