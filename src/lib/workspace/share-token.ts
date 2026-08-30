import { randomBytes } from "node:crypto";

/**
 * A public share token — the whole capability behind a "Share to web" link.
 *
 * 16 cryptographically-random bytes rendered as base64url: URL-safe (only
 * `A-Z a-z 0-9 - _`, no padding), 22 characters, 128 bits of entropy. That is
 * unguessable by any practical means, which is the entire security model — the
 * token IS the auth for the public read-only route, so it must never be short,
 * sequential, or derived from the page id.
 */
export function generateShareToken(): string {
  return randomBytes(16).toString("base64url");
}
