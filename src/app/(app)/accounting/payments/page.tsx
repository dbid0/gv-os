import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Plug } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { ConfirmQueueCell } from "@/components/accounting/confirm-queue-cell";
import { cents } from "@/lib/money";
import { listPaymentEvents } from "@/lib/payments/capture";
import { ClaimCell } from "@/components/accounting/claim-cell";
import { claimsByPayment, repsByClient } from "@/lib/payments/claims-store";
import { deriveCommissions, totalsByRep } from "@/lib/payments/commissions";
import { listClaimRows, listRates } from "@/lib/payments/rates-store";

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
  const [events, claims, repsFor, claimRows, rateRows] = await Promise.all([
    listPaymentEvents(),
    claimsByPayment(),
    repsByClient(),
    listClaimRows(),
    listRates(),
  ]);

  // Commissions derive on read — payment cents × claim × rate, never stored.
  // Rules are matched within the payment's client, so one offer's rates can
  // never price another offer's claims.
  const repNameById = new Map([...repsFor.values()].flat().map((r) => [r.id, r.name]));
  const commissionRows = events.flatMap((e) => {
    if (!e.clientId) return [];
    const forClient = rateRows.filter((r) => r.clientId === e.clientId);
    return deriveCommissions(
      [{ id: e.id, amountCents: e.amountCents, kind: e.kind, clientId: e.clientId }],
      claimRows.filter((c) => c.paymentEventId === e.id),
      forClient.map((r) => ({
        salesRole: r.salesRole,
        rateBps: r.rateBps,
        priority: r.priority,
      })),
    );
  });
  const repTotals = totalsByRep(commissionRows);

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
                  <th className="py-2 pr-3 font-medium">Credit</th>
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
                    <td className="py-2 pr-3">
                      {/* Claims credit seats on CHARGES with an offer scope.
                          Refunds get clawbacks later; agency rows have no
                          reps to credit. */}
                      {e.kind !== "refund" && e.clientId ? (
                        <ClaimCell
                          paymentEventId={e.id}
                          claims={claims.get(e.id) ?? []}
                          reps={repsFor.get(e.clientId) ?? []}
                        />
                      ) : (
                        <span className="text-faint text-xs">—</span>
                      )}
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

      {repTotals.length > 0 && (
        <Panel
          title="Commissions — derived"
          aside={
            <span className="text-faint text-xs">
              computed from claims × rates on read — nothing stored
            </span>
          }
        >
          <ul className="divide-y">
            {repTotals.map((t) => (
              <li key={t.repId} className="flex items-center gap-3 py-2 text-sm">
                <span className="text-foreground flex-1 font-medium">
                  {repNameById.get(t.repId) ?? "Unknown rep"}
                </span>
                {t.unknownRateRows > 0 && (
                  <span className="text-warning text-xs">
                    {t.unknownRateRows} claim{t.unknownRateRows === 1 ? "" : "s"} with
                    no rate set
                  </span>
                )}
                <span className="numeric text-foreground">
                  <Money amount={cents(t.totalCents)} />
                </span>
              </li>
            ))}
          </ul>
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
