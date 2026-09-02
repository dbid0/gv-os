import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { shellUser } from "@/lib/auth/user";
import { selectHomeIdentity } from "@/lib/home/identity";
import { applyPreview, visibleClientIds } from "@/lib/home/visibility";
import { isPlatformRole } from "@/lib/team-roles";
import { listTeamMembers } from "@/lib/team";

/**
 * The offers the SIGNED-IN viewer may read, resolved once per page.
 *
 * Pairs with the route guard: the guard says which pages open, this says whose
 * numbers appear on them. `allowed === null` means no restriction.
 *
 * Fails CLOSED for a scoped role and OPEN for an owner: if the roster lookup
 * throws we cannot tell a rep from an admin, and the safe answer there is the
 * unrestricted one the app has always shown — the guard is still the boundary
 * on which pages exist. What must never happen is a REP silently widening to
 * every offer, which is why the lane rule itself (in `visibleClientIds`) never
 * treats a missing lane as "everything".
 */
export interface ViewerScope {
  /** Offer ids the viewer may read; null = every offer. */
  allowed: string[] | null;
  /** True when the viewer is limited to a subset. */
  restricted: boolean;
  /** The offer's name when the viewer is pinned to exactly one; else null. */
  label: string | null;
}

export async function getViewerScope(): Promise<ViewerScope> {
  try {
    const [user, members, cookieStore] = await Promise.all([
      shellUser(),
      listTeamMembers(),
      cookies(),
    ]);
    const roster = selectHomeIdentity(members, user?.email ?? null);

    const db = getDb();
    const rows = await db
      .select({ id: clients.id, slug: clients.slug, name: clients.name })
      .from(clients)
      .where(eq(clients.status, "active"));

    // "View as" is a preview of a NARROWER seat, so scoping honours it too —
    // otherwise previewing a rep would still show the owner every offer.
    const roleCookie = cookieStore.get("gv-dev-role")?.value ?? "";
    const previewRole = isPlatformRole(roleCookie) ? roleCookie : null;
    const laneSlug = cookieStore.get("gv-dev-client")?.value ?? "";
    const previewLane = rows.find((r) => r.slug === laneSlug)?.id ?? null;
    const identity = applyPreview(roster, previewRole, previewLane);

    const allowed = visibleClientIds(
      identity,
      rows.map((r) => r.id),
    );
    const label =
      allowed?.length === 1
        ? (rows.find((r) => r.id === allowed[0])?.name ?? null)
        : null;
    return { allowed, restricted: allowed !== null, label };
  } catch {
    return { allowed: null, restricted: false, label: null };
  }
}
