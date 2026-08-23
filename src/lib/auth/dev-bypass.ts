/**
 * The ONE auth bypass, structurally fenced away from production.
 *
 * DISABLE_AUTH=true opens the app for local dev and CDP verification runs —
 * but only where VERCEL_ENV is not "production". On the live deployment the
 * login wall stands even if the env var lingers, so re-locking can never
 * silently regress on a stale variable.
 *
 * Dev-verification path (documented, keep working):
 *   - local: DISABLE_AUTH=true in .env.local (staging DB) — headless CDP
 *     walks the app without a session
 *   - preview: set DISABLE_AUTH=true on the Vercel preview environment only
 *   - roles: the gv-dev-role / gv-dev-client cookies preview NARROWER roles;
 *     they only ever restrict, never authenticate
 */
export function devAuthBypass(): boolean {
  return process.env.DISABLE_AUTH === "true" && process.env.VERCEL_ENV !== "production";
}
