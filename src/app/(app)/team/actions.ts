"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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
  memberRoleColumns,
} from "@/lib/team-roles";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
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
  await requireUser();
  const input = createInput.parse(raw);
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

export async function updateTeamMember(raw: z.input<typeof updateInput>) {
  await requireUser();
  const input = updateInput.parse(raw);
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
  await requireUser();
  const memberId = z.string().uuid().parse(id);
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
  await requireUser();
  const memberId = z.string().uuid().parse(id);
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
