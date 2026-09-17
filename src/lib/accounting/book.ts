import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { sheetMirrorDeals, sheetSyncRuns } from "@/db/schema/app";
import { agencySummary, type AgencySummary } from "@/lib/accounting/agency-summary";
import {
  clientBooks,
  type ClientBookDeal,
  type ClientBookEntry,
} from "@/lib/accounting/client-book";
import { runFinanceSheetSync } from "@/lib/accounting/sheet-sync";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { loadRoster } from "@/lib/roster-server";

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

/** What every book view shares: when it was read, and whether that read failed. */
interface BookFreshness {
  /** When the figures were taken from the sheet. Null = never. */
  syncedAt: Date | null;
  /** True when this view tried to refresh and the sheet could not be read. */
  refreshFailed: boolean;
}

export interface AgencyBook extends BookFreshness {
  summary: AgencySummary;
}

export interface ClientBook extends BookFreshness {
  clients: ClientBookEntry[];
}

interface MirrorRead extends BookFreshness {
  deals: ClientBookDeal[];
}

/**
 * The current mirror rows, refreshing the sheet first when they are stale.
 *
 * Everything comes from the finance-sheet mirror: the same rows the sheet's
 * own summary block sums, each already carrying its fee, net, AR and partner
 * split at that row's own percentage. Nothing is recomputed and nothing is
 * read from a second source, so a page can only say what the sheet says.
 *
 * Both book views go through here, so the agency total and the per-client cut
 * can never be reading two different runs of the sheet.
 *
 * This deliberately does NOT use the cached `latestReconciliation`: the app
 * shell asks that on every page, so within one request it can already hold the
 * run from BEFORE the refresh below and would hand back the stale figures.
 *
 * Fail-soft: if the sheet cannot be read, the last good run is used and the
 * caller is told; with no run at all the book reads empty, never broken.
 */
async function currentDeals(now: Date): Promise<MirrorRead> {
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
      refreshFailed = true;
    }
  }

  if (!run) return { deals: [], syncedAt: null, refreshFailed };

  const rows = await db
    .select({
      client: sheetMirrorDeals.client,
      dateClosed: sheetMirrorDeals.dateClosed,
      revenueCents: sheetMirrorDeals.revenueCents,
      cashCents: sheetMirrorDeals.cashCents,
      payoutStatus: sheetMirrorDeals.payoutStatus,
      figures: sheetMirrorDeals.figures,
    })
    .from(sheetMirrorDeals)
    .where(eq(sheetMirrorDeals.runId, run.id));

  const deals: ClientBookDeal[] = rows.map((d) => {
    const ours = d.figures?.ours ?? {};
    return {
      client: d.client,
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

  return { deals, syncedAt: run.createdAt, refreshFailed };
}

/** The agency book — the ONE read behind the Accounting front page. */
export async function agencyBook(
  todayKey: string,
  now: Date = new Date(),
): Promise<AgencyBook> {
  const { deals, syncedAt, refreshFailed } = await currentDeals(now);
  return { summary: agencySummary(deals, todayKey), syncedAt, refreshFailed };
}

/**
 * The same book, cut by client — one summary per offer, off the same rows.
 *
 * The roster supplies the offer names and the alias table does the matching,
 * so a new offer appears here by being added to the roster, never by editing
 * this file.
 */
export async function clientBook(
  todayKey: string,
  now: Date = new Date(),
): Promise<ClientBook> {
  const [{ deals, syncedAt, refreshFailed }, roster] = await Promise.all([
    currentDeals(now),
    loadRoster(),
  ]);
  return {
    clients: clientBooks(
      deals,
      todayKey,
      roster.map((c) => ({ slug: c.slug, name: c.name })),
      matchesSheetClient,
    ),
    syncedAt,
    refreshFailed,
  };
}
