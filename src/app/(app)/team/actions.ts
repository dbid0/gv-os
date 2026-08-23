"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { teamMembers } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { TEAM_ROLE_VALUES } from "@/lib/team-roles";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const createInput = z.object({
  name: z.string().min(1, "A member needs a name."),
  role: z.enum(TEAM_ROLE_VALUES),
  email: z.string().email().optional().or(z.literal("")),
  clientId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});

export async function createTeamMember(raw: z.input<typeof createInput>) {
  await requireUser();
  const input = createInput.parse(raw);
  const db = getDb();
  const [member] = await db
    .insert(teamMembers)
    .values({
      name: input.name.trim(),
      role: input.role,
      email: input.email?.trim() || null,
      clientId: input.clientId ?? null,
      notes: input.notes?.trim() || null,
    })
    .returning();
  revalidatePath("/team");
  return { id: member.id };
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
  return { ok: true };
}
