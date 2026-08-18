import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolves the "@/*" alias straight from tsconfig.json, natively.
    tsconfigPaths: true,
    alias: {
      // See tests/stubs/server-only.ts for why this is safe.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Modules where a regression costs real money get a hard gate.
      // lib/money and lib/splits land in a later PR and must stay at 100%.
      include: ["src/env.ts", "src/env.server.ts", "src/lib/**"],
      thresholds: {
        "src/env.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/env.server.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Money math. A regression here costs real money, so nothing ships
        // untested. If this gate fails, write the test, do not lower the bar.
        "src/lib/money.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/splits.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Sales commissions move money to reps, so the engine ships fully covered.
        "src/lib/sales/commission.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The payout rollup decides what each rep is actually paid — same bar.
        "src/lib/sales/commission-rollup.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The rows -> rollup adapter feeds the payout run, so it ships covered.
        "src/lib/sales/rollup-adapter.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
