/**
 * Who is allowed in.
 *
 * Access is an allowlist, not a registration flow. There are two ways onto it:
 *
 *   1. OWNERS — the ALLOWED_EMAILS env list (defaults to daniel@/gus@). These
 *      addresses are ALWAYS in, checked with no database round-trip, and can
 *      never be locked out — the fail-safe the whole gate hangs on.
 *   2. INVITED MEMBERS — an ACTIVE row in `app.team_members` whose email
 *      matches. Adding a member from inside the app IS granting them login,
 *      and setting them inactive revokes it. This is the DB-aware half, and
 *      lives in `allowlist-server.ts` (it needs the database); this file stays
 *      PURE so the login form, the middleware, and the tests can all import it.
 *
 * Enforced in three places on purpose:
 *   1. the login form, so a wrong address fails fast with a clear message
 *   2. the auth callback, which is the one that actually matters
 *   3. the middleware, which signs out anyone who somehow holds a session
 *
 * The owner list is configurable via ALLOWED_EMAILS (comma-separated) so adding
 * an owner is an environment change, not a deploy of new code.
 */

const DEFAULT_ALLOWED = ["daniel@globalventures.app", "gus@globalventures.app"];

export function allowedEmails(raw = process.env.ALLOWED_EMAILS): string[] {
  const configured = (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_ALLOWED;
}

export function isAllowed(email: string | null | undefined, raw?: string): boolean {
  if (!email) return false;
  return allowedEmails(raw).includes(email.trim().toLowerCase());
}

/**
 * The DB-aware decision, as a PURE function of its inputs so the whole gate is
 * testable without a database. A caller injects `loadActiveMemberEmails`, which
 * yields the emails of ACTIVE team members (or null/undefined / throws when the
 * database could not be reached).
 *
 * Three guarantees, in order:
 *   - OWNER SHORT-CIRCUIT: an owner (env allowlist) returns true BEFORE the
 *     loader is ever called. Owners never touch the DB and can never be locked
 *     out — even if the loader would throw.
 *   - INVITED MEMBER: a non-owner is allowed only if their (case-insensitive)
 *     email is in the active-member set.
 *   - FAIL-SAFE DENY: any failure reaching that set (throw, null, undefined)
 *     denies the NON-owner. It never throws and never widens.
 */
export async function isAllowedWith(
  email: string | null | undefined,
  raw: string | undefined,
  loadActiveMemberEmails: () => Promise<Iterable<string> | null | undefined>,
): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  // Owners are ALWAYS in, with no database call. This is the fail-safe: an
  // owner holds a session even when Postgres is down, and a slow or erroring
  // member lookup can never lock daniel@/gus@ out.
  if (allowedEmails(raw).includes(normalized)) return true;

  // A non-owner is allowed ONLY if they are an active team member. Anything
  // that goes wrong reaching that set denies them — deny by default — without
  // crashing and without affecting owners, who already returned above.
  let members: Iterable<string> | null | undefined;
  try {
    members = await loadActiveMemberEmails();
  } catch {
    return false;
  }
  if (!members) return false;
  for (const member of members) {
    if (member.trim().toLowerCase() === normalized) return true;
  }
  return false;
}
