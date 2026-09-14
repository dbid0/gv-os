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
        // The new-deal-form mapper appends money — same bar.
        "src/lib/sheets/new-deal.ts": {
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
        // Payout assemblers: which money rows a run creates (rev-share + split).
        "src/lib/payouts/run.ts": {
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
        // Payment tag rules decide which payments an offer's dashboard cash
        // counts, and the payment-field readers feed them. Fully covered.
        "src/lib/tracking/tag-rules.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Show/close rates split by confirmation — the number that says whether
        // confirming calls works. Pure, fully covered.
        "src/lib/crm/confirmation-rates.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Students board: who counts as a buyer, their week, and what they
        // paid net of refunds. Pure, fully covered.
        "src/lib/students/board.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The end-of-call form's locked vocabulary and validation: what counts
        // as a close and what money a report may carry. Fully covered.
        "src/lib/calls/eoc-form.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The call log: which state every booking is in and which report
        // owns its outcome. Pure, fully covered.
        "src/lib/calls/call-log.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Which money alarms reach the owner banner, and in what order.
        "src/lib/notifications/integrity.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Clawbacks move what reps are owed: link rules, proportional
        // clawback math, waivers. Fully covered.
        "src/lib/payments/clawbacks.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The MCP server's protocol and key handling: auth by hash, read-only
        // tools, teaching errors, nothing internal leaked. Fully covered.
        "src/lib/mcp/protocol.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/mcp/keys.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Who counts as one person: merge rules, inbox lists, lead rows keyed
        // under the person. Fully covered.
        "src/lib/tracking/identity.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // What a fresh pull may change on a stored booking — never erasing a
        // known invitee or status. Fully covered.
        "src/lib/bookings/merge.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Short links: code shape and the redirect-target guard. Fully covered.
        "src/lib/marketing/short-link.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/tracking/payment-fields.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
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
        // Gamification: streaks, personal bests, and the activity heatmap.
        // Derived entirely from existing rows, no stored state — so the badges
        // that shape rep behaviour ship as pure, fully covered math.
        "src/lib/gamification/engine.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // Role home dashboards: the pure shaping behind the Coach (manager) and
        // Wingman (rep) home pages, plus who-is-this identity resolution. Derived
        // entirely from existing rows — no new tables — so the boards that
        // greet a manager or rep on login ship as pure, fully covered logic.
        "src/lib/home/identity.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/home/coach-model.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/home/wingman-model.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // AI assistant pure logic: role gating, the tool registry, free-text
        // routing, the deterministic quick-answers, and the stubbed provider.
        // Role gating decides what the assistant can touch (money tools stay
        // admin-only), so it ships fully covered like the rest of the core.
        "src/lib/ai/capabilities.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/ai/roles.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/ai/tools.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/ai/starter-questions.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/ai/quick-answers.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/ai/router.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/ai/provider.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
