import type { HomeIdentity } from "@/lib/home/identity";
import type { PlatformRole } from "@/lib/team-roles";

/**
 * WHICH OFFERS A VIEWER MAY SEE.
 *
 * The route guard answers "can you open this page". It does not answer "whose
 * numbers may you read once you are on it" — and those are different questions.
 * A sales rep is legitimately granted `/sales` (their leaderboard, their
 * commissions), but that page was listing EVERY offer's cash: any rep could
 * read all four clients' revenue. This is the missing half.
 *
 * The rule, least-restrictive first:
 *   • admin / unmapped owner → every offer
 *   • sales_manager → their lane, or every offer when agency-wide
 *   • sales_rep, team_member → ONLY their own lane
 *   • a viewer with a role but NO lane → nothing, rather than everything
 *
 * That last line is the important one. Everywhere else in this codebase
 * ambiguity widens access, because wrongly locking the owner out is the worse
 * failure. Here it must NOT: a rep whose lane is unset is a data gap, and
 * defaulting a data gap to "show them every client's book" is precisely the
 * exposure being closed. Missing lane → empty, and the surface says so.
 */

/** The lane a viewer belongs to, read from their roster row. */
export function viewerLaneClientId(identity: HomeIdentity): string | null {
  return identity.managerClientId ?? identity.member?.clientId ?? null;
}

/**
 * The offer ids this viewer may read, filtered to those actually active.
 * `null` means "no restriction" — every offer.
 */
export function visibleClientIds(
  identity: HomeIdentity,
  activeClientIds: string[],
): string[] | null {
  const role = identity.platformRole;

  // Admin, or an unmapped owner (daniel@ / gus@): the whole book.
  if (role === null || role === "admin") return null;

  const lane = viewerLaneClientId(identity);

  if (role === "sales_manager") {
    // An agency-wide manager has no lane and sees everything.
    return lane === null ? null : activeClientIds.filter((id) => id === lane);
  }

  // Rep / team member: their lane only, and nothing at all without one.
  if (lane === null) return [];
  return activeClientIds.filter((id) => id === lane);
}

/** Convenience: does this viewer see the whole book? */
export function seesEveryOffer(
  identity: HomeIdentity,
  activeClientIds: string[],
): boolean {
  return visibleClientIds(identity, activeClientIds) === null;
}

/**
 * Filter any client-tagged rows to what this viewer may read. Rows whose
 * client cannot be determined are DROPPED for a scoped viewer — an untagged
 * row could belong to any offer, so showing it would leak by accident.
 */
export function scopeRowsToViewer<T>(
  rows: T[],
  clientIdOf: (row: T) => string | null,
  allowed: string[] | null,
): T[] {
  if (allowed === null) return rows;
  const set = new Set(allowed);
  return rows.filter((r) => {
    const id = clientIdOf(r);
    return id !== null && set.has(id);
  });
}

/**
 * Apply the "View as" preview to a viewer's identity — RESTRICT-ONLY.
 *
 * The middleware already lets an owner preview a narrower ROLE via the
 * `gv-dev-role` cookie; scoping has to honour the same preview or "View as
 * sales rep" would keep showing the owner every offer, which is the opposite
 * of what the preview is for.
 *
 * Two guardrails make this safe to trust:
 *   1. The preview applies ONLY when the real viewer is an owner/admin — the
 *      same rule as `effectiveRole`, so a real rep cannot forge a wider role.
 *   2. The preview lane (`gv-dev-client`) is read ONLY while previewing, so a
 *      real rep with no roster lane cannot cookie their way from "nothing" to
 *      an offer. Their own roster lane always wins.
 *
 * A preview with no lane resolves to no lane, and the caller renders the honest
 * empty view rather than a borrowed one.
 */
export function applyPreview(
  identity: HomeIdentity,
  previewRole: PlatformRole | null,
  previewLaneClientId: string | null,
): HomeIdentity {
  const realIsOwner =
    identity.platformRole === null || identity.platformRole === "admin";
  if (!realIsOwner || previewRole === null) return identity;
  return {
    ...identity,
    platformRole: previewRole,
    // Replace the lane wholesale: an owner has no roster lane to preserve, and
    // `viewerLaneClientId` reads these two fields in this order.
    managerClientId: previewLaneClientId,
    member: null,
  };
}
