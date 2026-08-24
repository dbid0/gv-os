import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  clients,
  commissionSplits,
  deals,
  integrations,
  reps,
  transactions,
} from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { readSheetValues } from "@/lib/google/sheets";
import { clientBySlug } from "@/lib/roster";
import {
  newDealToTransaction,
  parseNewDealsSheet,
  type NewDealMapped,
} from "@/lib/sheets/new-deal";

type Db = ReturnType<typeof getDb>;

/** Find a client's rep by name, or create one. Sales reps come from the sheet. */
async function findOrCreateRep(
  db: Db,
  clientId: string,
  name: string,
  role: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: reps.id })
    .from(reps)
    .where(and(eq(reps.clientId, clientId), eq(reps.name, name)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(reps)
    .values({ clientId, name, role, status: "active" })
    .returning({ id: reps.id });
  return created.id;
}

/**
 * Create the deal record + its commission splits for one mapped row. Idempotent
 * on the deal's external_ref (= the transaction idempotency key), so re-running
 * never doubles a deal or its splits.
 */
async function upsertDealAndSplits(
  db: Db,
  m: NewDealMapped,
  clientId: string,
): Promise<void> {
  const [deal] = await db
    .insert(deals)
    .values({
      clientId,
      dealType: m.dealType,
      offer: m.offer,
      contractValueCents: m.revenueCents,
      closedAt: new Date(`${m.occurredOn}T12:00:00Z`),
      customerName: m.meta.customerName,
      source: "sheet",
      externalRef: m.idempotencyKey,
    })
    .onConflictDoNothing({ target: [deals.externalRef] })
    .returning({ id: deals.id, repId: deals.repId });
  if (!deal) return; // already imported — splits + money events exist too

  // Deal-level money events (same shape as the Log-a-deal flow) so commissions,
  // quotas, and the rep leaderboard derive from this deal exactly like a logged
  // one. This is the money_events ledger; the transactions row above is the v2
  // backlog. No view sums both, so a deal shows once in each — never doubled.
  const occurredAt = new Date(`${m.occurredOn}T12:00:00Z`);
  if (m.cashCents > 0) {
    await db
      .insert(moneyEvents)
      .values({
        occurredAt,
        eventType: "payment_received",
        amountCents: m.cashCents,
        clientId,
        dealId: deal.id,
        source: "sheet.newDealImport",
        idempotencyKey: `deal:${deal.id}:initial`,
      })
      .onConflictDoNothing({ target: [moneyEvents.idempotencyKey] });
  }
  if (m.processorFeeCents > 0) {
    await db
      .insert(moneyEvents)
      .values({
        occurredAt,
        eventType: "processor_fee",
        amountCents: -m.processorFeeCents,
        clientId,
        dealId: deal.id,
        source: "sheet.newDealImport",
        idempotencyKey: `deal:${deal.id}:fee`,
      })
      .onConflictDoNothing({ target: [moneyEvents.idempotencyKey] });
  }

  const participants: { name: string; role: string; bps: number }[] = [];
  if (m.meta.closerName && m.meta.closerBps > 0) {
    participants.push({
      name: m.meta.closerName,
      role: "closer",
      bps: m.meta.closerBps,
    });
  }
  if (m.meta.setterName && m.meta.setterBps > 0) {
    participants.push({
      name: m.meta.setterName,
      role: "setter",
      bps: m.meta.setterBps,
    });
  }

  let closerRepId: string | null = null;
  for (const p of participants) {
    const repId = await findOrCreateRep(db, clientId, p.name, p.role);
    if (p.role === "closer") closerRepId = repId;
    await db.insert(commissionSplits).values({
      dealId: deal.id,
      repId,
      role: p.role,
      rateBps: p.bps,
      basis: "cash_collected",
    });
  }
  if (closerRepId) {
    await db.update(deals).set({ repId: closerRepId }).where(eq(deals.id, deal.id));
  }
}

/**
 * The new-deal importer (the second feed). Reads an offer's tracking sheet's
 * `🤝 New Deals` tab → parses by header → maps each row to a transaction →
 * appends it. Idempotent: the mapper keys every row by sheet + timestamp and
 * the insert is onConflictDoNothing, so re-running never doubles a deal. This
 * only ever runs on an explicit trigger — never on a schedule.
 */

const NEW_DEALS_RANGE = "'🤝 New Deals'!A1:AZ2000";

const PROCESSOR_PROVIDERS = ["stripe", "whop", "fanbasis"];

export interface ImportResult {
  read: number;
  inserted: number;
  skipped: number;
  refused: { row: string; reason: string }[];
  /** Where this offer's money comes from — "processor" means the money rows
   * are skipped here (the processor feed owns them) to avoid double-counting;
   * deals + commissions still import. */
  moneyFrom: "processor" | "new-deal";
}

export async function importNewDealsForOffer(slug: string): Promise<ImportResult> {
  const db = getDb();
  const [client] = await db
    .select({ id: clients.id, sheet: clients.trackingSheetId })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  if (!client) throw new Error(`No client row for "${slug}".`);
  if (!client.sheet) {
    throw new Error(`No tracking sheet connected for "${slug}" — set one first.`);
  }

  // Dedup between the two feeds (Daniel: never double-count). If a payment
  // processor is connected for this offer, IT owns the money rows — so the
  // new-deal form here contributes deals + commissions only, no money.
  const [processor] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(
      and(
        eq(integrations.clientId, client.id),
        eq(integrations.status, "connected"),
        inArray(integrations.provider, PROCESSOR_PROVIDERS),
      ),
    )
    .limit(1);
  const processorOwnsMoney = Boolean(processor);

  const offer = clientBySlug(slug)?.offer ?? null;
  const values = await readSheetValues(client.sheet, NEW_DEALS_RANGE);
  const rows = parseNewDealsSheet(values);

  const refused: { row: string; reason: string }[] = [];
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const mapped = newDealToTransaction(row, {
      clientId: client.id,
      sheetId: client.sheet,
      offer,
    });
    if (!mapped.ok) {
      refused.push({ row: row.timestamp || "(no timestamp)", reason: mapped.reason });
      continue;
    }
    // The money row (transactions) is everything but meta; the deal record +
    // commission splits derive from the full mapping. When a processor owns
    // the money, we skip the transaction and only record the deal/commissions.
    const { meta: _meta, ...txn } = mapped.row;
    void _meta;
    if (!processorOwnsMoney) {
      const res = await db
        .insert(transactions)
        .values({ ...txn, enteredBy: "new-deal-import" })
        .onConflictDoNothing({ target: [transactions.idempotencyKey] })
        .returning({ id: transactions.id });
      if (res.length > 0) inserted += 1;
      else skipped += 1;
    }

    await upsertDealAndSplits(db, mapped.row, client.id);
  }

  return {
    read: rows.length,
    inserted,
    skipped,
    refused,
    moneyFrom: processorOwnsMoney ? "processor" : "new-deal",
  };
}
