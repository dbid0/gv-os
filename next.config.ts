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
      { source: "/", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
