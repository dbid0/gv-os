import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { cents } from "@/lib/money";
import {
  getCloseRatePct,
  getEodCompliance,
  getSalesOverview,
} from "@/lib/sales/queries";

export const metadata = { title: "Manager Home - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The Sales Manager home (v2 §6): the managed offers' sales world and
 * nothing else — deliberately zero accounting. Offer-level scoping narrows
 * further when manager↔team assignments carry real users.
 */
export default async function ManagerHomePage() {
  const [overview, compliance, closeRatePct] = await Promise.all([
    getSalesOverview(),
    getEodCompliance(),
    getCloseRatePct(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Sales"
        highlight="manager."
        description="Your offers' sales engine: deals, reps, EODs. Accounting lives with the admins."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Cash collected"
          value={<Money amount={cents(overview.cashCollectedCents)} />}
          tone="success"
        />
        <Kpi label="Deals closed" value={String(overview.dealsClosed)} />
        <Kpi
          label="Close rate"
          value={closeRatePct !== null ? `${closeRatePct}%` : "—"}
        />
        <Kpi
          label="EODs filed"
          value={`${compliance.submitted}/${compliance.total || "—"}`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Deals", href: "/sales" },
          { label: "Leaderboard", href: "/sales/leaderboard" },
          { label: "EOD reports", href: "/sales/eod" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="card-grad hover-lift hover:border-brand/40 rounded-lg border p-4 text-sm font-medium"
          >
            {l.label} →
          </Link>
        ))}
      </div>
      <Panel title="Adding reps">
        <p className="text-faint text-sm">
          Reps are added under each client team&apos;s config (Sales → Teams) with the
          client&apos;s team email. Per-offer visibility is controlled by the admins.
        </p>
      </Panel>
    </div>
  );
}
