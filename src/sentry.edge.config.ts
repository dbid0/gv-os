/**
 * Sentry config for the Edge runtime (middleware, edge Route Handlers).
 * Loaded conditionally by src/instrumentation.ts.
 *
 * Gated behind the DSN: when unset, Sentry.init is never called and this
 * runtime behaves exactly as it does with no Sentry installed at all — no
 * SDK client, no outgoing requests, no console noise. Set SENTRY_DSN (or
 * NEXT_PUBLIC_SENTRY_DSN) in Vercel to turn this on.
 */
import * as Sentry from "@sentry/nextjs";

import { getServerSentryDsn } from "@/lib/observability/dsn";
import { scrubEmails } from "@/lib/observability/scrub-pii";

const dsn = getServerSentryDsn();

if (dsn) {
  Sentry.init({
    dsn,
    // Same low, fixed sampling rate as the server config — middleware runs
    // on every request, so this is not the place to trace everything.
    tracesSampleRate: 0.1,
    beforeSend: scrubEmails,
  });
}
