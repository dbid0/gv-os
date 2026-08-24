import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { teamMembers } from "@/db/schema/app";
import { roleFromTeamRows, type Role } from "@/lib/auth/roles";

/**
 * The signed-in user's REAL platform role, resolved from the Team roster.
 *
 * The role source is `team_members.role_key` (the platform role) plus the job
 * columns `role` / `rep_kind`, mapped through the roster's own `platformRoleOf`
 * so every surface speaks one vocabulary. A member's sales `reps` row is reached
 * through `team_members.rep_id`, so `team_members` is the single authoritative
 * place a person's platform role lives.
 *
 * SAFE DEFAULT (non-negotiable): any allowlisted email NOT mapped to a narrower
 * ACTIVE team member — owners daniel@/gus@ and every unmapped address included —
 * resolves to `admin`. Owners/unmapped are ALWAYS admin; this never restricts
 * them. On ANY uncertainty — no email, a DB error — it returns `admin` (when in
 * doubt, admin) and never throws, so role resolution can never lock anyone out
 * or break a signed-in session.
 *
 * This only changes what a logged-in user SEES. It does not touch who may log
 * in — that stays the allowlist (`allowlist.ts`), unchanged.
 */
export async function resolveRealRole(email: string | null | undefined): Promise<Role> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return "admin";

  try {
    const db = getDb();
    const rows = await db
      .select({
        role: teamMembers.role,
        roleKey: teamMembers.roleKey,
        repKind: teamMembers.repKind,
      })
      .from(teamMembers)
      .where(
        and(
          eq(sql`lower(${teamMembers.email})`, normalized),
          eq(teamMembers.status, "active"),
        ),
      );

    return roleFromTeamRows(rows);
  } catch {
    // A DB blip must never restrict — least of all an owner. When in doubt, admin.
    return "admin";
  }
}
