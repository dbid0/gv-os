/**
 * Local access-token verification — the middleware's fast path.
 *
 * `getUser()` revalidates against Supabase over the network on EVERY
 * navigation — a coast-to-coast round trip before any page starts. But the
 * access token is a signed JWT, and the auth project publishes its public
 * keys (ES256, JWKS). Verifying the signature locally proves exactly what
 * Supabase's endpoint proves — the token was minted by the auth server and
 * has not been tampered with — without leaving the edge.
 *
 * The network path still exists: a token that is invalid, expired, or within
 * a minute of expiring falls through to getUser(), which also refreshes the
 * session cookies. With one-hour tokens, ~59 of 60 navigations skip the trip.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

// Module-scope: the JWKS is fetched once per runtime and cached by jose
// (with automatic re-fetch on unknown key ids — key rolls just work).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function keySet(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

const EXPIRY_MARGIN_SEC = 60;

export type VerifiedUser = { email: string };

/** Null = take the network path (invalid, foreign, expired, or expiring). */
export async function verifyAccessToken(
  token: string | null | undefined,
): Promise<VerifiedUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keySet());
    const email = typeof payload.email === "string" ? payload.email : null;
    const exp = typeof payload.exp === "number" ? payload.exp : 0;
    if (!email) return null;
    if (exp - Math.floor(Date.now() / 1000) < EXPIRY_MARGIN_SEC) return null;
    return { email };
  } catch {
    return null;
  }
}
