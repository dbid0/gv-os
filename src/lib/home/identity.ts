/**
 * Home identity — pure, deterministic, and 100% covered.
 *
 * PR #154 resolves a signed-in email to a platform ROLE for routing. The role
 * home dashboards need one thing more: WHICH person in the Team roster this is,
 * so the Coach page can scope to a manager's offers and the Wingman page can
 * bind to a rep. This module answers that from the roster rows alone — no clock,
 * no database — so the selection can be pinned down with tests to the last
 * branch, the same bar the rest of the home logic holds.
 *
 * It never widens access. It mirrors the role resolver's "widest role wins" rule
 * so a data anomaly (a person on two rows) never wrongly narrows what they see,
 * and it never invents an identity: an email with no active roster row resolves
 * to a null identity, which the pages render as an owner/admin view.
 */

import { platformRoleOf, type PlatformRole } from "@/lib/team-roles";
import type { TeamMemberRow } from "@/lib/team";

/** The signed-in person, resolved from the roster, for the home dashboards. */
export interface HomeIdentity {
  /** Widest platform role across their active roster rows; null when unmapped. */
  platformRole: PlatformRole | null;
  /** The roster row that best represents them (manager row, else rep row, else widest). */
  member: TeamMemberRow | null;
  /** Their sales `reps` id, when any roster row links one. */
  repId: string | null;
  /** The client lane a manager row scopes to; null = agency-wide or not a manager. */
  managerClientId: string | null;
}

/**
 * Least-restrictive first, mirroring the route resolver: when a person maps to
 * more than one active row, the WIDEST role wins so ambiguity never restricts.
 */
const PLATFORM_RANK: Record<PlatformRole, number> = {
  admin: 0,
  sales_manager: 1,
  sales_rep: 2,
  team_member: 3,
};

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

/**
 * The home identity for a signed-in email from the roster rows.
 *
 * Only ACTIVE rows whose email matches (case-insensitively) are considered. No
 * match — an owner (daniel@/gus@) or any unmapped address — yields a null
 * identity, which the pages treat as the all-offers admin view. When several
 * rows match, the widest role wins; the rep link and the manager's client lane
 * are read from whichever row actually carries them.
 */
export function selectHomeIdentity(
  members: TeamMemberRow[],
  email: string | null | undefined,
): HomeIdentity {
  const normalized = normalizeEmail(email);
  const candidates = normalized
    ? members.filter(
        (m) => m.status === "active" && normalizeEmail(m.email) === normalized,
      )
    : [];

  if (candidates.length === 0) {
    return { platformRole: null, member: null, repId: null, managerClientId: null };
  }

  const withRole = candidates.map((m) => ({ m, role: platformRoleOf(m) }));
  const best = withRole.reduce((a, b) =>
    PLATFORM_RANK[b.role] < PLATFORM_RANK[a.role] ? b : a,
  );

  // The row that carries a rep link drives the Wingman board; a manager row
  // drives the Coach scope. Fall back to the widest-role row for display.
  const repRow = candidates.find((m) => m.repId) ?? null;
  const managerRow = withRole.find((x) => x.role === "sales_manager")?.m ?? null;

  return {
    platformRole: best.role,
    member: managerRow ?? repRow ?? best.m,
    repId: repRow?.repId ?? null,
    managerClientId: managerRow ? managerRow.clientId : null,
  };
}

/** True when the home should render the Coach (manager) dashboard for this identity. */
export function isCoachViewer(identity: HomeIdentity): boolean {
  // Reps get the Wingman board; everyone else who can reach /home/manager
  // (managers, admins, and unmapped owners) gets Coach.
  return !(identity.platformRole === "sales_rep" && identity.repId !== null);
}

/**
 * The offers a Coach viewer is scoped to.
 *
 * A manager pinned to one client's lane sees only that offer; an agency-wide
 * manager, an admin, and an unmapped owner all see every active offer. The
 * `activeClientIds` are passed in so this stays a pure function of the roster.
 */
export function managedClientIds(
  identity: HomeIdentity,
  activeClientIds: string[],
): string[] {
  if (identity.platformRole !== "sales_manager" || identity.managerClientId === null) {
    return activeClientIds;
  }
  const scoped = identity.managerClientId;
  return activeClientIds.filter((id) => id === scoped);
}
