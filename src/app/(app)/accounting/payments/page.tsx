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
import {
  clawbacksAsCommissionRows,
  deriveClawbacks,
  refundedByCharge,
  suggestCharges,
  summarizeClawbacks,
  type ClawbackRow,
} from "@/lib/payments/clawbacks";
import {
  chargesForClients,
  listClawbackWaivers,
  listRefundLinks,
} from "@/lib/payments/clawbacks-store";
import { listClaimRows, listRates } from "@/lib/payments/rates-store";
import { RefundCell, type RefundCharge } from "@/components/accounting/refund-cell";

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
  const [events, claims, repsFor, claimRows, rateRows, links, waivers] =
    await Promise.all([
      listPaymentEvents(),
      claimsByPayment(),
      repsByClient(),
      listClaimRows(),
      listRates(),
      listRefundLinks(),
      listClawbackWaivers(),
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

  // Clawbacks derive the same way, from refunds deliberately linked to the
  // charge they reverse, rates resolved per offer exactly like commissions.
  const refunds = events.filter((e) => e.kind === "refund" && e.clientId);
  const charges = await chargesForClients([
    ...new Set(refunds.map((r) => r.clientId as string)),
  ]);
  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const chargeFor = new Map(links.map((l) => [l.refundEventId, l.chargeEventId]));
  const refunded = refundedByCharge(
    links,
    new Map(events.map((e) => [e.id, e.amountCents])),
  );
  const clawbackRows: ClawbackRow[] = refunds.flatMap((r) =>
    deriveClawbacks({
      refunds: [r],
      links,
      claims: claimRows,
      rules: rateRows
        .filter((x) => x.clientId === r.clientId)
        .map((x) => ({
          salesRole: x.salesRole,
          rateBps: x.rateBps,
          priority: x.priority,
        })),
      waivers,
    }),
  );
  const clawSummary = summarizeClawbacks(clawbackRows);
  const unlinkedRefunds = refunds.filter((r) => !chargeFor.has(r.id)).length;
  const asRefundCharge = (c: (typeof charges)[number]): RefundCharge => ({
    id: c.id,
    label: c.label,
    email: c.email,
    amountCents: c.amountCents,
    occurredAt: c.occurredAt ? c.occurredAt.toISOString() : null,
  });

  const repTotals = totalsByRep(
    commissionRows.concat(clawbacksAsCommissionRows(clawbackRows)),
  );

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
                      {/* Claims credit seats on CHARGES with an offer scope;
                          a REFUND links to its charge and claws back. Agency
                          rows have no reps to credit. */}
                      {e.kind !== "refund" && e.clientId ? (
                        <ClaimCell
                          paymentEventId={e.id}
                          claims={claims.get(e.id) ?? []}
                          reps={repsFor.get(e.clientId) ?? []}
                        />
                      ) : e.kind === "refund" && e.clientId ? (
                        <RefundCell
                          refundEventId={e.id}
                          linked={(() => {
                            const id = chargeFor.get(e.id);
                            const c = id ? chargeById.get(id) : undefined;
                            return c ? asRefundCharge(c) : null;
                          })()}
                          suggestions={suggestCharges(
                            {
                              id: e.id,
                              kind: e.kind,
                              clientId: e.clientId,
                              amountCents: e.amountCents,
                              occurredAt: e.occurredAt,
                              email: e.email,
                            },
                            charges,
                            refunded,
                          ).map((c) => asRefundCharge(chargeById.get(c.id)!))}
                          clawbacks={clawbackRows
                            .filter((c) => c.refundEventId === e.id)
                            .map((c) => ({
                              role: c.role,
                              repName: repNameById.get(c.repId) ?? "Unknown rep",
                              clawbackCents: c.clawbackCents,
                              waived: c.waived,
                              waiverReason: c.waiverReason,
                            }))}
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
          {(clawbackRows.length > 0 || unlinkedRefunds > 0) && (
            <p className="text-faint mt-3 text-xs">
              Totals include {clawSummary.counted} clawback
              {clawSummary.counted === 1 ? "" : "s"} (
              <Money amount={cents(clawSummary.countedCents)} />)
              {clawSummary.waived > 0 && (
                <>
                  ; {clawSummary.waived} waived (
                  <Money amount={cents(clawSummary.waivedCents)} />) left out
                </>
              )}
              {clawSummary.unknownRate > 0 &&
                `; ${clawSummary.unknownRate} with no rate set`}
              {unlinkedRefunds > 0 &&
                `. ${unlinkedRefunds} refund${unlinkedRefunds === 1 ? " isn't" : "s aren't"} linked to a charge yet, so no clawback derives for ${unlinkedRefunds === 1 ? "it" : "them"}.`}
            </p>
          )}
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
