import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { sheetMirrorDeals, sheetSyncRuns } from "@/db/schema/app";
import {
  agencySummary,
  type AgencySummary,
  type BookDeal,
} from "@/lib/accounting/agency-summary";
import { runFinanceSheetSync } from "@/lib/accounting/sheet-sync";

/**
 * How old the mirror may be before opening Accounting pulls the sheet again.
 *
 * Nothing pulled the finance sheet on a schedule, so a deal typed straight
 * into the sheet never reached this page until someone logged one through the
 * app. Pulling on view keeps the book current when it is looked at, without a
 * background job writing a full copy of the sheet every half hour whether
 * anyone reads it or not.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000;

export interface AgencyBook {
  summary: AgencySummary;
  /** When the figures were taken from the sheet. Null = never. */
  syncedAt: Date | null;
  /** True when this view tried to refresh and the sheet could not be read. */
  refreshFailed: boolean;
}

/**
 * The agency book — the ONE read behind the Accounting front page.
 *
 * Everything comes from the finance-sheet mirror: the same rows the sheet's
 * own summary block sums, each already carrying its fee, net, AR and partner
 * split at that row's own percentage. Nothing is recomputed and nothing is
 * read from a second source, so the page can only say what the sheet says.
 *
 * This deliberately does NOT use the cached `latestReconciliation`: the app
 * shell asks that on every page, so within one request it can already hold the
 * run from BEFORE the refresh below and would hand back the stale figures.
 *
 * Fail-soft: if the sheet cannot be read, the last good run is shown and the
 * page says so; with no run at all the book reads empty, never broken.
 */
export async function agencyBook(
  todayKey: string,
  now: Date = new Date(),
): Promise<AgencyBook> {
  const db = getDb();
  let refreshFailed = false;

  const latestRun = async () =>
    (
      await db
        .select({ id: sheetSyncRuns.id, createdAt: sheetSyncRuns.createdAt })
        .from(sheetSyncRuns)
        .where(eq(sheetSyncRuns.status, "ok"))
        .orderBy(desc(sheetSyncRuns.createdAt))
        .limit(1)
    )[0] ?? null;

  let run = await latestRun().catch(() => null);

  if (!run || now.getTime() - run.createdAt.getTime() > STALE_AFTER_MS) {
    try {
      await runFinanceSheetSync();
      run = await latestRun();
    } catch {
      // The sheet is unreachable right now. Show the last good run and say so,
      // rather than a blank page or a silently old one.
      refreshFailed = true;
    }
  }

  if (!run) {
    return { summary: agencySummary([], todayKey), syncedAt: null, refreshFailed };
  }

  const rows = await db
    .select({
      dateClosed: sheetMirrorDeals.dateClosed,
      revenueCents: sheetMirrorDeals.revenueCents,
      cashCents: sheetMirrorDeals.cashCents,
      payoutStatus: sheetMirrorDeals.payoutStatus,
      figures: sheetMirrorDeals.figures,
    })
    .from(sheetMirrorDeals)
    .where(eq(sheetMirrorDeals.runId, run.id));

  const deals: BookDeal[] = rows.map((d) => {
    const ours = d.figures?.ours ?? {};
    return {
      dateClosed: d.dateClosed,
      revenueCents: d.revenueCents,
      cashCents: d.cashCents,
      // A missing figure adds nothing to a sum; it is never invented.
      feeCents: ours.feeCents ?? 0,
      netCents: ours.netCents ?? 0,
      arCents: ours.arCents ?? 0,
      danielCents: ours.danielCents ?? 0,
      gusCents: ours.gusCents ?? 0,
      payoutStatus: d.payoutStatus ?? "",
    };
  });

  return {
    summary: agencySummary(deals, todayKey),
    syncedAt: run.createdAt,
    refreshFailed,
  };
}
