import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { integrations, sheetMirrorDeals, sheetSyncRuns } from "@/db/schema/app";
import { reconcileSheet, type MirrorReport } from "@/lib/accounting/sheet-mirror";
import { monthCashAllCents } from "@/lib/clients/targets";
import { fetchFinanceSheet } from "@/lib/google/sheets";

/**
 * Accounting Phase A orchestration: pull the sheet, recompute, store the
 * snapshot. Import-only — nothing here ever writes back to the sheet, and
 * nothing touches the ledger. The sheet remains the system of record.
 */

export interface SyncSummary {
  runId: string;
  rowCount: number;
  driftRowCount: number;
  totalAbsDriftCents: number;
}

export async function runFinanceSheetSync(): Promise<SyncSummary> {
  const db = getDb();
  const data = await fetchFinanceSheet();
  const report: MirrorReport = reconcileSheet(data.rawRows, data.computedRows);

  const [run] = await db
    .insert(sheetSyncRuns)
    .values({
      status: "ok",
      rowCount: report.rowCount,
      driftRowCount: report.driftRowCount,
      totalAbsDriftCents: report.totalAbsDriftCents,
    })
    .returning({ id: sheetSyncRuns.id });

  if (report.deals.length > 0) {
    await db.insert(sheetMirrorDeals).values(
      report.deals.map((d) => ({
        runId: run.id,
        rowIndex: d.input.rowIndex,
        dateClosed: d.input.dateClosed,
        client: d.input.client,
        dealType: d.input.dealType,
        offer: d.input.offer || null,
        method: d.input.method,
        payoutStatus: d.input.payoutStatus || null,
        revenueCents: d.input.revenueCents,
        cashCents: d.input.cashCents,
        figures: {
          ours: { ...d.ours },
          sheet: { ...d.sheet },
          driftCents: { ...d.driftCents },
        },
        hasDrift: d.hasDrift,
        notes: d.input.notes || null,
      })),
    );
  }

  // Stamp the vault connection so its card reflects reality — without this
  // the google_sheets integration reads "never synced" while syncing daily.
  await db
    .update(integrations)
    .set({
      lastSyncAt: new Date(),
      lastSyncNote: `${report.rowCount} deals, ${report.driftRowCount} drift rows ($${(report.totalAbsDriftCents / 100).toFixed(2)})`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrations.provider, "google_sheets"),
        eq(integrations.status, "connected"),
      ),
    );

  return {
    runId: run.id,
    rowCount: report.rowCount,
    driftRowCount: report.driftRowCount,
    totalAbsDriftCents: report.totalAbsDriftCents,
  };
}

export interface LatestReconciliation {
  run: {
    id: string;
    createdAt: Date;
    status: string;
    rowCount: number;
    driftRowCount: number;
    totalAbsDriftCents: number;
  } | null;
  deals: {
    rowIndex: number;
    dateClosed: string;
    client: string;
    dealType: string;
    method: string;
    payoutStatus: string | null;
    revenueCents: number;
    cashCents: number;
    figures: {
      ours: Record<string, number>;
      sheet: Record<string, number>;
      driftCents: Record<string, number>;
    };
    hasDrift: boolean;
  }[];
}

/** The latest run and its rows, for the reconciliation screen. */
export async function latestReconciliation(): Promise<LatestReconciliation> {
  const db = getDb();
  const [run] = await db
    .select({
      id: sheetSyncRuns.id,
      createdAt: sheetSyncRuns.createdAt,
      status: sheetSyncRuns.status,
      rowCount: sheetSyncRuns.rowCount,
      driftRowCount: sheetSyncRuns.driftRowCount,
      totalAbsDriftCents: sheetSyncRuns.totalAbsDriftCents,
    })
    .from(sheetSyncRuns)
    .orderBy(desc(sheetSyncRuns.createdAt))
    .limit(1);
  if (!run) return { run: null, deals: [] };

  const deals = await db
    .select({
      rowIndex: sheetMirrorDeals.rowIndex,
      dateClosed: sheetMirrorDeals.dateClosed,
      client: sheetMirrorDeals.client,
      dealType: sheetMirrorDeals.dealType,
      method: sheetMirrorDeals.method,
      payoutStatus: sheetMirrorDeals.payoutStatus,
      revenueCents: sheetMirrorDeals.revenueCents,
      cashCents: sheetMirrorDeals.cashCents,
      figures: sheetMirrorDeals.figures,
      hasDrift: sheetMirrorDeals.hasDrift,
    })
    .from(sheetMirrorDeals)
    .where(eq(sheetMirrorDeals.runId, run.id))
    .orderBy(sheetMirrorDeals.rowIndex);

  return { run, deals };
}

/** Net cash by calendar month from the latest mirror run — real, reconciled. */
export async function mirrorMonthly(): Promise<{ date: string; cents: number }[]> {
  const db = getDb();
  const [run] = await db
    .select({ id: sheetSyncRuns.id })
    .from(sheetSyncRuns)
    .orderBy(desc(sheetSyncRuns.createdAt))
    .limit(1);
  if (!run) return [];
  const rows = await db
    .select({
      dateClosed: sheetMirrorDeals.dateClosed,
      figures: sheetMirrorDeals.figures,
    })
    .from(sheetMirrorDeals)
    .where(eq(sheetMirrorDeals.runId, run.id));
  return rows.map((r) => ({
    date: r.dateClosed,
    cents: r.figures.ours.netCents ?? 0,
  }));
}

export interface OutstandingRow {
  client: string;
  dealType: string;
  dateClosed: string;
  revenueCents: number;
  cashCents: number;
  arCents: number;
  notes: string | null;
}

/** Deals with money still owed, from the latest mirror run — largest first. */
export async function mirrorOutstanding(): Promise<{
  rows: OutstandingRow[];
  totalArCents: number;
}> {
  const db = getDb();
  const [run] = await db
    .select({ id: sheetSyncRuns.id })
    .from(sheetSyncRuns)
    .orderBy(desc(sheetSyncRuns.createdAt))
    .limit(1);
  if (!run) return { rows: [], totalArCents: 0 };
  const all = await db
    .select({
      client: sheetMirrorDeals.client,
      dealType: sheetMirrorDeals.dealType,
      dateClosed: sheetMirrorDeals.dateClosed,
      revenueCents: sheetMirrorDeals.revenueCents,
      cashCents: sheetMirrorDeals.cashCents,
      figures: sheetMirrorDeals.figures,
      notes: sheetMirrorDeals.notes,
    })
    .from(sheetMirrorDeals)
    .where(eq(sheetMirrorDeals.runId, run.id));
  const rows = all
    .map((r) => ({
      client: r.client,
      dealType: r.dealType,
      dateClosed: r.dateClosed,
      revenueCents: r.revenueCents,
      cashCents: r.cashCents,
      arCents: r.figures.ours.arCents ?? 0,
      notes: r.notes,
    }))
    .filter((r) => r.arCents > 0)
    .sort((a, b) => b.arCents - a.arCents);
  return {
    rows,
    totalArCents: rows.reduce((sum, r) => sum + r.arCents, 0),
  };
}

/**
 * All-in cash collected this CT month, from the latest mirror run — the
 * evergreen top-bar figure. Fail-soft to 0: the shell must render even if
 * the mirror is empty or the read fails.
 */
export async function currentMonthCashCents(): Promise<number> {
  try {
    const db = getDb();
    const [run] = await db
      .select({ id: sheetSyncRuns.id })
      .from(sheetSyncRuns)
      .orderBy(desc(sheetSyncRuns.createdAt))
      .limit(1);
    if (!run) return 0;
    const rows = await db
      .select({
        dateClosed: sheetMirrorDeals.dateClosed,
        cashCents: sheetMirrorDeals.cashCents,
      })
      .from(sheetMirrorDeals)
      .where(eq(sheetMirrorDeals.runId, run.id));
    return monthCashAllCents(rows, new Date());
  } catch {
    return 0;
  }
}
