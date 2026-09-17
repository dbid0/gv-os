import Link from "next/link";
import { ArrowRight, Receipt, Scale, Wallet } from "lucide-react";

import { AgencyBook } from "@/components/accounting/agency-book";
import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/ui/status";
import { agencyBook } from "@/lib/accounting/book";
import { dayKeyIn } from "@/lib/time/zone";
import { viewerTimeZone } from "@/lib/time/viewer-zone";

export const metadata = { title: "Accounting - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The agency's book — the Master Finance Sheet's summary, in the app.
 *
 * This page used to open on an abstract "breakdown chain" (total → after fees
 * → after team → net) plus income grouped two ways, none of which is how the
 * two people who run this agency actually read their money. They read the
 * sheet: three periods across, revenue and cash, then what each partner is
 * owed. So that is what opens here now.
 *
 * Everything else — transactions, rev-share, payouts, AR, expenses,
 * reconciliation, payments, recovery — is a drill-down you reach from here
 * rather than a sibling competing for the front page.
 */

const DRILL_DOWNS = [
  { label: "Transactions", href: "/accounting/transactions", icon: Receipt },
  { label: "Client ledger", href: "/accounting/clients", icon: Receipt },
  { label: "Rev share", href: "/accounting/revshare", icon: Wallet },
  { label: "Payouts", href: "/accounting/payouts", icon: Wallet },
  { label: "AR", href: "/accounting/ar", icon: Scale },
  { label: "Expenses", href: "/accounting/expenses", icon: Receipt },
  { label: "Reconciliation", href: "/accounting/reconciliation", icon: Scale },
  { label: "Payments", href: "/accounting/payments", icon: Wallet },
  { label: "Recovery", href: "/accounting/recovery", icon: Wallet },
];

export default async function AccountingPage() {
  const tz = await viewerTimeZone();
  const { summary, syncedAt, refreshFailed } = await agencyBook(
    dayKeyIn(new Date(), tz),
  );
  const deals = summary.sections[0].rows.find((r) => r.key === "deals")?.allTime ?? 0;
  const syncedLabel = syncedAt
    ? syncedAt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="The"
        highlight="book."
        status={
          <StatusPill tone={deals > 0 ? "live" : "muted"}>
            {deals} {deals === 1 ? "deal" : "deals"}
          </StatusPill>
        }
      />

      <AgencyBook summary={summary} />

      <p className={refreshFailed ? "text-warning text-xs" : "text-faint text-xs"}>
        {syncedLabel === null
          ? "The finance sheet has not been read yet."
          : refreshFailed
            ? `Couldn't reach the finance sheet — showing it as of ${syncedLabel}.`
            : `From the finance sheet, ${syncedLabel}.`}
      </p>

      <div className="flex flex-wrap gap-2">
        {DRILL_DOWNS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground group inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <d.icon className="size-3.5" />
            {d.label}
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
