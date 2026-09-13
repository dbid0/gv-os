import "server-only";

import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { teamMembers } from "@/db/schema/app";
import { isAllowedWith } from "@/lib/auth/allowlist";

/**
 * The live login gate — the env owner allowlist OR'd with an active team-member
 * lookup. This is the DB-aware half of `allowlist.ts`: adding a member with an
 * email (and status active) grants them login, and setting them inactive (or
 * deleting them) revokes it on their next navigation.
 *
 * PERFORMANCE: the middleware re-checks this on EVERY request, so the DB read
 * is wrapped in `unstable_cache` (cross-request, mirroring roster-server.ts) —
 * not a query per navigation. Owners never reach it at all: `isAllowedWith`
 * short-circuits on the env list first, so the common path (daniel@/gus@) is a
 * pure array check with no I/O.
 *
 * REVOCATION: the cache lags reality by at most `MEMBER_TTL_SECONDS`, so
 * flipping a member inactive drops their access within that window — no manual
 * bust needed. The middleware re-checks the (cached) gate on EVERY request, so
 * within one TTL of being deactivated a member is signed out on their next
 * navigation. The TTL is deliberately short (well under 60s) for exactly this;
 * a grant (invite) becomes usable on the same short delay.
 */

/** Max staleness of the cached membership set — the revocation ceiling. ≤ 60s. */
const MEMBER_TTL_SECONDS = 30;

/** Lowercased emails of every ACTIVE team member. Throws only on a DB failure. */
async function loadActiveMemberEmailsFromDb(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ email: teamMembers.email })
    .from(teamMembers)
    .where(eq(teamMembers.status, "active"));
  return rows
    .map((r) => r.email?.trim().toLowerCase() ?? "")
    .filter((email) => email.length > 0);
}

const loadActiveMemberEmailsCached = unstable_cache(
  loadActiveMemberEmailsFromDb,
  ["active-member-emails"],
  { revalidate: MEMBER_TTL_SECONDS },
);

/**
 * The active-member set, cached across requests. Returns null ONLY on a genuine
 * database failure (which denies the non-owner — owners short-circuit before
 * this runs). If the cache layer itself is unavailable in this context it falls
 * back to one direct read, so a real member is never wrongly denied.
 */
async function activeMemberEmails(): Promise<Set<string> | null> {
  try {
    return new Set(await loadActiveMemberEmailsCached());
  } catch {
    try {
      return new Set(await loadActiveMemberEmailsFromDb());
    } catch {
      return null;
    }
  }
}

/**
 * The live, DB-aware allowlist check. Owners (env) always pass with no DB call;
 * everyone else must be an active team member. Never throws, never locks out an
 * owner. Use THIS at the login gate (middleware + auth callback); the pure
 * `isAllowed` stays for the client form and the tests.
 */
export async function isAllowedAsync(
  email: string | null | undefined,
): Promise<boolean> {
  return isAllowedWith(email, process.env.ALLOWED_EMAILS, activeMemberEmails);
}
