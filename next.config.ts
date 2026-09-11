import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache: re-visiting a page within 30s reuses the cached
    // payload instead of refetching — snappier back-and-forth navigation.
    // Fresh data still arrives on refresh and after the window expires.
    staleTimes: { dynamic: 30 },
  },
  async redirects() {
    return [
      // The app's one entry point. Declared here so Vercel's routing layer
      // answers it at the edge — the old server-component redirect cost a full
      // function invocation (cross-country, ~0.5s) before /dashboard even
      // started loading.
      // Permanent (308): the browser caches it, so typing the bare domain
      // skips the redirect round trip entirely after the first visit.
      { source: "/", destination: "/dashboard", permanent: true },
    ];
  },
};

// Build-time wrapping (instrumentation + sourcemap upload) is safe to apply
// unconditionally — it's independent of the runtime DSN gate in
// src/instrumentation-client.ts / sentry.server.config.ts / sentry.edge.config.ts,
// which is what actually turns Sentry on or off. org/project/authToken read
// from SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN automatically when
// set, so there is nothing to hardcode here.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: {
    // No auth token means Sentry has no way to accept an upload. Disabling
    // explicitly keeps local and CI builds from ever attempting the network
    // call, rather than relying on the plugin to infer it.
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
