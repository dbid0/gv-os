import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { sheetMirrorDeals, sheetSyncRuns, transactions } from "@/db/schema/app";
import { buildSheetImport } from "@/lib/transactions/engine";

/**
 * Idempotent Master-Finance-Sheet → transactions import. The sheet stays the
 * system of record: this only APPENDS rows the backlog doesn't have yet,
 * keyed by content (see sheetIdempotencyKey) so a rerun — or a resorted
 * sheet — imports nothing twice. Never edits, never deletes.
 */
export async function importSheetTransactions(): Promise<{
  candidates: number;
  imported: number;
  totalCashCents: number;
}> {
  const db = getDb();
  const [run] = await db
    .select({ id: sheetSyncRuns.id })
    .from(sheetSyncRuns)
    .orderBy(desc(sheetSyncRuns.createdAt))
    .limit(1);
  if (!run) return { candidates: 0, imported: 0, totalCashCents: 0 };

  const mirror = await db
    .select({
      dateClosed: sheetMirrorDeals.dateClosed,
      client: sheetMirrorDeals.client,
      dealType: sheetMirrorDeals.dealType,
      method: sheetMirrorDeals.method,
      revenueCents: sheetMirrorDeals.revenueCents,
      cashCents: sheetMirrorDeals.cashCents,
      figures: sheetMirrorDeals.figures,
      notes: sheetMirrorDeals.notes,
    })
    .from(sheetMirrorDeals)
    .where(eq(sheetMirrorDeals.runId, run.id));

  const rows = buildSheetImport(
    mirror.map((m) => ({
      input: { ...m, notes: m.notes ?? "" },
      ours: { feeCents: m.figures.ours.feeCents ?? 0 },
    })),
  );

  let imported = 0;
  for (const row of rows) {
    const inserted = await db
      .insert(transactions)
      .values(row)
      .onConflictDoNothing({ target: [transactions.idempotencyKey] })
      .returning({ id: transactions.id });
    if (inserted.length > 0) imported += 1;
  }
  return {
    candidates: rows.length,
    imported,
    totalCashCents: rows.reduce((sum, r) => sum + r.cashCents, 0),
  };
}
