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
        // Confirming a processor event appends money — same bar.
        "src/lib/transactions/confirm.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Processor fees come straight out of collected cash, so same bar.
        "src/lib/fees.ts": {
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
        // The agency ledger chain: what the business actually keeps.
        "src/lib/transactions/ledger.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The homepage big number: the figure Daniel reads first every day.
        "src/lib/transactions/homepage.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // AR + money calendar: what is owed and when.
        "src/lib/transactions/ar.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Payout math: what actually leaves the account each month.
        "src/lib/payouts/math.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Rev-share: what clients owe GV — the core of the business model.
        "src/lib/revshare/engine.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // v2 transactions backlog: every dollar becomes one of these rows.
        "src/lib/transactions/engine.ts": {
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
        // Choosing which partner split applies moves money to the wrong person
        // if it is wrong, so it ships fully covered like the rest of the core.
        "src/lib/accounting/split-rules.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Sealed credential storage. A regression here leaks client API keys
        // or bricks every stored connection, so it ships fully covered.
        "src/lib/crypto/secretbox.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The finance-sheet mirror recomputes Daniel + Gus's real payouts and
        // is the drift detector for the system of record — fully covered.
        "src/lib/accounting/sheet-mirror.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Payment normalizers shape real money amounts from processor
        // payloads — a wrong sign or scale here misstates cash. Fully covered.
        "src/lib/payments/normalize.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Quota pacing decides if a rep or team reads red or green against
        // target. Pure math, held to the same bar as the rest of Sales logic.
        "src/lib/sales/quota-pacing.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Call/activity logging: the disposition->metric mapping and the
        // per-rep aggregation that feeds rep activity metrics. Pure math, held
        // to the same bar as the rest of Sales logic.
        "src/lib/sales/call-activity.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
