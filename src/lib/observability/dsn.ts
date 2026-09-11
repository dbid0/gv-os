/**
 * Resolves the Sentry DSN for the server and edge runtimes.
 *
 * `SENTRY_DSN` is the preferred name here since these processes never ship
 * to the browser and the value doesn't need the `NEXT_PUBLIC_` prefix — but
 * `NEXT_PUBLIC_SENTRY_DSN` (already required for the client, see src/env.ts)
 * is accepted too, so Daniel can set just one env var in Vercel and light up
 * all three runtimes at once.
 *
 * Read directly from process.env rather than through src/env.server.ts on
 * purpose: that module validates unrelated, required app config (database
 * URLs and the like) and throws hard on a bad value. Observability must
 * never be the reason the server fails to boot, so it stays decoupled.
 */
export function getServerSentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}
