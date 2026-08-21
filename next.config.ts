import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
