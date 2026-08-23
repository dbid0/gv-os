import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Plug } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { ConfirmQueueCell } from "@/components/accounting/confirm-queue-cell";
import { cents } from "@/lib/money";
import { listPaymentEvents } from "@/lib/payments/capture";

export const metadata = { title: "Payments - GV OS" };
export const dynamic = "force-dynamic";

const fmtWhen = (d: Date | null) =>
  d
    ? d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

export default async function PaymentsPage() {
  const events = await listPaymentEvents();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Payment"
        highlight="capture."
        description="Every processor event, caught once and kept forever — deduped on the processor's own transaction id, scoped to the client whose connection caught it. Capture is not the ledger: a captured event posts to the backlog only when you confirm it below."
        status={
          <StatusPill tone={events.length ? "live" : "muted"}>
            {events.length} captured
          </StatusPill>
        }
      />

      {events.length === 0 ? (
        <Panel title="Nothing captured yet">
          <p className="text-faint space-y-1 py-8 text-center text-sm">
            Connect a payments provider under{" "}
            <Link href="/settings/integrations" className="text-brand">
              Settings → Integrations
            </Link>
            , then either paste its webhook URL into the processor or let the scheduled
            Stripe pull collect events. The confirm queue is built and waiting on
            processor keys — events land here the moment one connects, and nothing is
            invented in the meantime.
          </p>
        </Panel>
      ) : (
        <Panel title="Captured events">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Processor</th>
                  <th className="py-2 pr-3 font-medium">Scope</th>
                  <th className="py-2 pr-3 font-medium">Payer</th>
                  <th className="py-2 pr-3 font-medium">Event</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Post</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                      {fmtWhen(e.occurredAt ?? e.createdAt)}
                    </td>
                    <td className="py-2 pr-3 capitalize">{e.provider}</td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {e.clientName ?? "Agency"}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {e.email ?? "—"}
                    </td>
                    <td className="text-faint py-2 pr-3 text-xs">
                      {e.kind === "refund" ? (
                        <span className="inline-flex items-center gap-1">
                          <ArrowDownRight className="size-3.5" /> {e.label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <ArrowUpRight className="size-3.5" /> {e.label}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <Money amount={cents(e.amountCents)} />
                    </td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={e.status === "posted" ? "live" : "pending"}>
                        {e.status}
                      </StatusPill>
                    </td>
                    <td className="py-2">
                      {e.status === "captured" ? (
                        <ConfirmQueueCell eventId={e.id} />
                      ) : (
                        <span className="text-faint text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <p className="text-faint text-xs">
        <Plug className="mr-1 inline size-3" />
        Webhook URLs live on each payments connection card. The Stripe pull runs via
        /api/sync/payments, secret-gated, for keys sealed in the vault.
      </p>
    </div>
  );
}
