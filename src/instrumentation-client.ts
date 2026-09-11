/**
 * Sentry init for the browser. Next.js loads this file as its own entry
 * point on every route, ahead of the app — no wiring into layout.tsx needed.
 *
 * Gated behind the DSN: when unset, Sentry.init is never called and the
 * client behaves exactly as it does with no Sentry installed at all — no
 * SDK, no outgoing requests, no console noise in local dev. Set
 * NEXT_PUBLIC_SENTRY_DSN in Vercel to turn this on.
 */
import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";
import { scrubEmails } from "@/lib/observability/scrub-pii";

if (env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    // Errors always report. Traces are sampled low — enough to see slow
    // navigations and API calls without tracing every click.
    tracesSampleRate: 0.1,
    beforeSend: scrubEmails,
  });
}

// Reports the start of each App Router navigation as a span, so slow
// client-side transitions show up next to server-side traces. No-op with no
// active client, same as onRequestError in src/instrumentation.ts.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
