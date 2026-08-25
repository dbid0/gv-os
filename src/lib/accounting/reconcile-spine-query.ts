import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, integrations, paymentEvents, transactions } from "@/db/schema/app";
import { dayKeyCT } from "@/lib/charts";
import { revShareLines } from "@/lib/revshare/engine";
import { revShareRules as revShareRulesTable } from "@/db/schema/app";
import {
  normalizeCashAuthority,
  resolveCashAuthority,
} from "@/lib/sources/cash-authority";
import {
  reconcileSpine,
  type OfferMonthInput,
  type ReconcileReport,
} from "@/lib/accounting/reconcile-spine";

const PROCESSOR_PROVIDERS = ["stripe", "whop", "fanbasis", "shopify", "commas"];

/**
 * Gather the numbers the Money Spine reconciler compares. Everything is grouped
 * per offer + month: what the ledger holds, what rev-share rated, and what the
 * processors captured — then the pure reconciler decides green vs drift.
 */
export async function getSpineReconciliation(): Promise<ReconcileReport> {
  const db = getDb();

  const [clientRows, ledgerRows, rules, payRows, processorRows] = await Promise.all([
    db
      .select({
        id: clients.id,
        slug: clients.slug,
        name: clients.name,
        cashAuthority: clients.cashAuthority,
      })
      .from(clients),
    db
      .select({
        clientId: transactions.clientId,
        layer: transactions.layer,
        direction: transactions.direction,
        occurredOn: transactions.occurredOn,
        cashCents: transactions.cashCents,
        processorFeeCents: transactions.processorFeeCents,
      })
      .from(transactions)
      .where(and(eq(transactions.layer, "client"), isNotNull(transactions.clientId))),
    db
      .select({
        clientId: revShareRulesTable.clientId,
        rateBps: revShareRulesTable.rateBps,
        effectiveFrom: revShareRulesTable.effectiveFrom,
      })
      .from(revShareRulesTable),
    db
      .select({
        clientId: paymentEvents.clientId,
        kind: paymentEvents.kind,
        amountCents: paymentEvents.amountCents,
        occurredAt: paymentEvents.occurredAt,
        status: paymentEvents.status,
      })
      .from(paymentEvents)
      .where(
        and(
          isNotNull(paymentEvents.clientId),
          inArray(paymentEvents.status, ["captured", "posted"]),
        ),
      ),
    db
      .select({ clientId: integrations.clientId })
      .from(integrations)
      .where(
        and(
          eq(integrations.status, "connected"),
          inArray(integrations.provider, PROCESSOR_PROVIDERS),
          isNotNull(integrations.clientId),
        ),
      ),
  ]);

  const clientById = new Map(clientRows.map((c) => [c.id, c]));
  const hasProcessor = new Set(processorRows.map((p) => p.clientId as string));

  // Ledger cash + fees per client+month.
  const ledger = new Map<string, { cash: number; fee: number }>();
  for (const r of ledgerRows) {
    if (r.direction !== "in" || !r.clientId) continue;
    const key = `${r.clientId}:${r.occurredOn.slice(0, 7)}`;
    const cur = ledger.get(key) ?? { cash: 0, fee: 0 };
    cur.cash += r.cashCents;
    cur.fee += r.processorFeeCents;
    ledger.set(key, cur);
  }

  // Rev-share basis (cash after fees) per client+month, where a rule applies.
  const basis = new Map<string, number>();
  for (const l of revShareLines(ledgerRows, rules)) {
    basis.set(`${l.clientId}:${l.month}`, l.cashAfterFeesCents);
  }

  // Captured + posted processor charges (net of refunds) per client+month.
  const captured = new Map<string, number>();
  for (const p of payRows) {
    if (!p.clientId || !p.occurredAt) continue;
    const signed =
      p.kind === "refund" ? -p.amountCents : p.kind === "charge" ? p.amountCents : 0;
    if (signed === 0) continue;
    const key = `${p.clientId}:${dayKeyCT(p.occurredAt).slice(0, 7)}`;
    captured.set(key, (captured.get(key) ?? 0) + signed);
  }

  // Every offer+month that appears in the ledger or in processor captures.
  const keys = new Set<string>([...ledger.keys(), ...captured.keys()]);
  const inputs: OfferMonthInput[] = [];
  for (const key of keys) {
    const [clientId, month] = key.split(":");
    const client = clientById.get(clientId);
    if (!client) continue;
    const led = ledger.get(key) ?? { cash: 0, fee: 0 };
    const proc = hasProcessor.has(clientId);
    inputs.push({
      slug: client.slug,
      name: client.name,
      month,
      authority: resolveCashAuthority(
        normalizeCashAuthority(client.cashAuthority),
        proc,
      ),
      hasProcessor: proc,
      ledgerCashCents: led.cash,
      ledgerFeeCents: led.fee,
      revshareBasisCents: basis.has(key) ? (basis.get(key) as number) : null,
      processorCapturedCents: captured.get(key) ?? 0,
    });
  }

  return reconcileSpine(inputs);
}
