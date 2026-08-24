import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db/client";
import { clients, profiles, reps } from "@/db/schema/app";
import { currentUser } from "@/lib/auth/server";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { type AiRole, isAiRole } from "@/lib/ai/roles";

/**
 * Who the assistant is answering for, and at what scope.
 *
 * Scope reuses the app's EXISTING role model + View-as, not a parallel one:
 *   - The face role is the user's REAL role (resolved from the Team roster by
 *     `resolveRealRole`), narrowed by the `gv-dev-role` preview cookie exactly
 *     as the middleware treats it: restrict-only, and only an admin may preview.
 *     A non-admin real role ignores the cookie, so it can never widen scope.
 *   - A rep face binds to the rep linked to the signed-in profile (Team #140's
 *     rep-linked profiles). When PREVIEWING with no linked rep, it falls back
 *     to the first active rep so the demo shows real numbers, and says so — a
 *     real narrower role with no linked rep reads nothing rather than a
 *     stranger's numbers.
 *   - A manager's `clientId` scopes team reads to their own offers when known.
 *
 * Read-only: this never writes, and it never widens a role.
 */

export interface AiViewer {
  role: AiRole;
  profileId: string | null;
  displayName: string;
  /** The rep this viewer reads "own" numbers as, when resolvable. */
  repId: string | null;
  repName: string | null;
  /** A manager's team scope (own offers), when resolvable. */
  clientId: string | null;
  /** True when the face came from View-as rather than the real session. */
  previewing: boolean;
  /** True when a rep face fell back to a representative rep for preview. */
  repIsFallback: boolean;
}

/** The rep linked to a signed-in email, with their team. */
async function repForEmail(
  email: string,
): Promise<{ id: string; name: string; clientId: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: reps.id, name: reps.name, clientId: reps.clientId })
    .from(reps)
    .innerJoin(profiles, eq(reps.profileId, profiles.id))
    .where(and(eq(profiles.email, email), eq(reps.status, "active")))
    .limit(1);
  return row ?? null;
}

/** The first active rep, alphabetically — the preview fallback. */
async function firstActiveRep(): Promise<{
  id: string;
  name: string;
  clientId: string;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: reps.id, name: reps.name, clientId: reps.clientId })
    .from(reps)
    .where(eq(reps.status, "active"))
    .orderBy(asc(reps.name))
    .limit(1);
  return row ?? null;
}

/** The team (client) a manager previews as — the first active team. */
async function firstActiveClientId(): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.status, "active"))
    .orderBy(asc(clients.name))
    .limit(1);
  return row?.id ?? null;
}

/** The signed-in person's display name, local-part fallback. */
function nameFromEmail(email: string | undefined): string {
  const local = email?.split("@")[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

export async function resolveAiViewer(): Promise<AiViewer> {
  const [user, cookieStore] = await Promise.all([currentUser(), cookies()]);
  const email = user?.email;

  // The REAL role, then the restrict-only preview on top. Only an admin may
  // wear another face; a non-admin ignores the cookie entirely. A role with no
  // assistant face (team_member/client — route-guarded away from /assistant)
  // degrades to the most restrictive face, never up to admin.
  const realRole = await resolveRealRole(email);
  const previewValue = cookieStore.get("gv-dev-role")?.value ?? null;
  const previewFace: AiRole | null =
    realRole === "admin" && isAiRole(previewValue) ? previewValue : null;
  const previewing = previewFace !== null;
  const role: AiRole = previewFace ?? (isAiRole(realRole) ? realRole : "sales_rep");

  const displayName =
    typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name
      ? user.user_metadata.full_name
      : nameFromEmail(email);

  // Resolve the rep this viewer reads "own" numbers as. A real linked rep wins;
  // otherwise fall back to a representative rep ONLY while previewing, so a real
  // narrower role never sees a stranger's numbers.
  let linked = email ? await repForEmail(email) : null;
  let repIsFallback = false;
  if (!linked && role !== "admin" && previewing) {
    linked = await firstActiveRep();
    repIsFallback = linked !== null;
  }

  // A manager scopes team reads to their own offers when we can tell which team.
  let clientId: string | null = linked?.clientId ?? null;
  if (role === "sales_manager" && !clientId) {
    clientId = previewing ? await firstActiveClientId() : null;
  }

  return {
    role,
    profileId: user?.id ?? null,
    displayName,
    repId: linked?.id ?? null,
    repName: linked?.name ?? null,
    clientId,
    previewing,
    repIsFallback,
  };
}
