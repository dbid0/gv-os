import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { paymentEvents, transactions } from "@/db/schema/app";
import { dayKeyCT } from "@/lib/charts";
import {
  reconcileAgency,
  type AgencyMonthInput,
  type AgencyReconcileReport,
} from "@/lib/accounting/reconcile-agency";

/**
 * Gather the agency book: agency-layer ledger cash and agency-scope (clientId
 * null) processor captures, per month, then run the pure reconciler.
 */
export async function getAgencyReconciliation(): Promise<AgencyReconcileReport> {
  const db = getDb();

  const [ledgerRows, payRows] = await Promise.all([
    db
      .select({
        occurredOn: transactions.occurredOn,
        cashCents: transactions.cashCents,
      })
      .from(transactions)
      .where(and(eq(transactions.layer, "agency"), eq(transactions.direction, "in"))),
    db
      .select({
        kind: paymentEvents.kind,
        amountCents: paymentEvents.amountCents,
        status: paymentEvents.status,
        occurredAt: paymentEvents.occurredAt,
      })
      .from(paymentEvents)
      .where(isNull(paymentEvents.clientId)),
  ]);

  const ledger = new Map<string, number>();
  for (const r of ledgerRows) {
    const m = r.occurredOn.slice(0, 7);
    ledger.set(m, (ledger.get(m) ?? 0) + r.cashCents);
  }

  const captured = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const p of payRows) {
    if (!p.occurredAt) continue;
    const signed =
      p.kind === "refund" ? -p.amountCents : p.kind === "charge" ? p.amountCents : 0;
    if (signed === 0) continue;
    const m = dayKeyCT(p.occurredAt).slice(0, 7);
    if (p.status === "captured" || p.status === "posted") {
      captured.set(m, (captured.get(m) ?? 0) + signed);
    }
    if (p.status === "captured") {
      pending.set(m, (pending.get(m) ?? 0) + signed);
    }
  }

  const months = new Set<string>([
    ...ledger.keys(),
    ...captured.keys(),
    ...pending.keys(),
  ]);
  const inputs: AgencyMonthInput[] = [...months].map((month) => ({
    month,
    ledgerCashCents: ledger.get(month) ?? 0,
    capturedCents: captured.get(month) ?? 0,
    pendingCaptureCents: pending.get(month) ?? 0,
  }));

  return reconcileAgency(inputs);
}
