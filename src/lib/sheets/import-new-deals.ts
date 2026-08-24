import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, transactions } from "@/db/schema/app";
import { readSheetValues } from "@/lib/google/sheets";
import { clientBySlug } from "@/lib/roster";
import { newDealToTransaction, parseNewDealsSheet } from "@/lib/sheets/new-deal";

/**
 * The new-deal importer (the second feed). Reads an offer's tracking sheet's
 * `🤝 New Deals` tab → parses by header → maps each row to a transaction →
 * appends it. Idempotent: the mapper keys every row by sheet + timestamp and
 * the insert is onConflictDoNothing, so re-running never doubles a deal. This
 * only ever runs on an explicit trigger — never on a schedule.
 */

const NEW_DEALS_RANGE = "'🤝 New Deals'!A1:AZ2000";

export interface ImportResult {
  read: number;
  inserted: number;
  skipped: number;
  refused: { row: string; reason: string }[];
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
    // `meta` (closer/setter/AR) drives commissions in a later slice; the money
    // row is everything else.
    const { meta: _meta, ...txn } = mapped.row;
    void _meta;
    const res = await db
      .insert(transactions)
      .values({ ...txn, enteredBy: "new-deal-import" })
      .onConflictDoNothing({ target: [transactions.idempotencyKey] })
      .returning({ id: transactions.id });
    if (res.length > 0) inserted += 1;
    else skipped += 1;
  }

  return { read: rows.length, inserted, skipped, refused };
}
