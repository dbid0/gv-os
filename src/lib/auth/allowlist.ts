/**
 * Who is allowed in.
 *
 * GV OS is an internal tool for two people. It is not a product with signups,
 * so access is an allowlist, not a registration flow. Anyone can request a
 * magic link, but only these addresses can hold a session.
 *
 * Enforced in three places on purpose:
 *   1. the login form, so a wrong address fails fast with a clear message
 *   2. the auth callback, which is the one that actually matters
 *   3. the middleware, which signs out anyone who somehow holds a session
 *
 * Configurable via ALLOWED_EMAILS (comma-separated) so adding a person is an
 * environment change, not a deploy of new code.
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
