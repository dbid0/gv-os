/**
 * Next.js instrumentation entry point. Two jobs:
 *
 * 1. `register()` runs once as each server runtime boots and loads the
 *    matching Sentry config file — required so the SDK knows whether it's
 *    running in Node.js or on the Edge.
 * 2. `onRequestError` reports errors from Server Components, Route Handlers,
 *    and middleware that never reach a React error boundary (those are
 *    exactly the silent-failure cases this whole change exists for).
 *
 * Both are safe with no DSN configured: sentry.server.config.ts /
 * sentry.edge.config.ts skip calling Sentry.init when the env var is unset,
 * and Sentry.captureRequestError is a no-op with no active client — it walks
 * the (empty) scope and returns, it does not throw or make a network call.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
