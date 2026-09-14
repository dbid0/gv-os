import "server-only";

import { filterCountedBookings } from "@/lib/bookings/counted";

import { and, desc, eq, gte } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  applications,
  bookings,
  clients,
  clientTrackingRows,
  reps as repsTable,
} from "@/db/schema/app";
import { getClientReport, type ClientReport } from "@/lib/clients/report";
import { listConfirmations } from "@/lib/crm/confirmation-store";
import type { EocReport } from "@/lib/crm/confirmation-rates";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";
import {
  applyTagRulesToFeed,
  emptyTagSummary,
  type FeedTagSummary,
} from "@/lib/tracking/tag-rules";
import { listTagRules } from "@/lib/tracking/tag-rules-store";
import { offerSpeedToLead } from "@/lib/crm/offer-stl";
import { listCallLogs } from "@/lib/sales/call-queries";
import { listDeals } from "@/lib/sales/queries";
import {
  assembleOfferMetrics,
  DISCONNECTED_STL,
  type OfferMetrics,
} from "@/lib/tracking/offer-metrics";
import {
  cashRowsForClient,
  currentSnapshot,
  latestSnapshotsBySource,
  leadsForClient,
} from "@/lib/tracking/queries";
import { collectedInWindow } from "@/lib/tracking/cash-mix";
import {
  dealsRevenueInWindow,
  type WindowMoneyFeed,
} from "@/lib/tracking/window-money";
import { offerModelOf, stagesForModel } from "@/lib/clients/offer-model";
import { rowsForClient } from "@/lib/clients/attribution";
import {
  homeRangeRows,
  previousBounds,
  type RangeBounds,
} from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";

/** The end-of-call report columns every loader reads — one shape, one place. */
const EOC_REPORT_COLUMNS = {
  email: clientTrackingRows.email,
  status: clientTrackingRows.status,
  outcome: clientTrackingRows.outcome,
  occurredAt: clientTrackingRows.occurredAt,
};

/** Emails with an end-of-call report on file (lowercased) — clears stuck calls. */
function reportedEmailsOf(rows: { email: string | null }[]): Set<string> {
  return new Set(
    rows
      .map((r) => r.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e)),
  );
}

export type OfferSalesData = {
  metrics: OfferMetrics;
  report: ClientReport | null;
  /** Recent applications, newest first — display list + per-day chart. */
  apps: {
    name: string | null;
    email: string | null;
    formName: string | null;
    submittedAt: Date | null;
    createdAt: Date;
  }[];
  deals: Awaited<ReturnType<typeof listDeals>>;
  calls: Awaited<ReturnType<typeof listCallLogs>>;
  repName: Map<string, string>;
};

/**
 * The one door for an offer's sales surface: fetches every primitive the
 * page needs (the same queries the page ran inline before), feeds the
 * metrics engine, and hands back the assembled numbers plus the display
 * lists. Any surface reading from here shows the same figures by
 * construction — the engine is computed once from one set of rows.
 */
export async function loadOfferSales(
  clientId: string | null,
  slug: string,
  clientName: string,
): Promise<OfferSalesData> {
  const db = getDb();
  const now = new Date();
  const daysAgo30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [clientRow] = clientId
    ? await db
        .select({ countedCallSources: clients.countedCallSources })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1)
    : [undefined];

  const [apps, calls, deals, report, repRows, bookingRows, confirmations] =
    await Promise.all([
      clientId
        ? db
            .select({
              name: applications.name,
              email: applications.email,
              formName: applications.formName,
              submittedAt: applications.submittedAt,
              createdAt: applications.createdAt,
            })
            .from(applications)
            .where(
              and(
                eq(applications.clientId, clientId),
                gte(applications.createdAt, daysAgo30),
              ),
            )
            .orderBy(desc(applications.createdAt))
            .limit(100)
        : Promise.resolve([]),
      // Client filter pushed into SQL (activity_logs_client_idx / deals_client_idx)
      // instead of loading every client's rows and filtering in JS. A null offer
      // matched nothing before (both client_id columns are NOT NULL), so it stays
      // an empty list — same rows, same order, one client's rows fetched.
      clientId ? listCallLogs(500, clientId) : Promise.resolve([]),
      clientId ? listDeals(clientId) : Promise.resolve([]),
      getClientReport(slug, clientName).catch(() => null),
      clientId
        ? db
            .select({ id: repsTable.id, name: repsTable.name })
            .from(repsTable)
            .where(eq(repsTable.clientId, clientId))
        : Promise.resolve([]),
      clientId
        ? db
            .select({
              id: bookings.id,
              provider: bookings.provider,
              inviteeName: bookings.inviteeName,
              inviteeEmail: bookings.inviteeEmail,
              startsAt: bookings.startsAt,
              status: bookings.status,
            })
            .from(bookings)
            .where(eq(bookings.clientId, clientId))
            .limit(500)
        : Promise.resolve([]),
      clientId ? listConfirmations(clientId) : Promise.resolve([]),
    ]);

  // Second wave — rows that hang off the current tracking snapshot: the
  // deals tab (paid-mix strip) and the EOC emails that clear stuck calls.
  let dealRows: {
    cashCents: number | null;
    revenueCents: number | null;
    label: string | null;
  }[] = [];
  let reportedEmails = new Set<string>();
  let eocReports: EocReport[] | null = null;
  if (report?.clientId) {
    const snap = await currentSnapshot(report.clientId);
    if (snap) {
      const [{ deals: snapDeals }, eocRows] = await Promise.all([
        cashRowsForClient(snap.syncId),
        db
          .select(EOC_REPORT_COLUMNS)
          .from(clientTrackingRows)
          .where(
            and(
              eq(clientTrackingRows.syncId, snap.syncId),
              eq(clientTrackingRows.tab, "eoc"),
            ),
          ),
      ]);
      dealRows = snapDeals.map((d) => ({
        cashCents: d.cashCents,
        revenueCents: d.revenueCents,
        label: d.closeType,
      }));
      reportedEmails = reportedEmailsOf(eocRows);
      eocReports = eocRows;
    }
  }

  const stl = report?.clientId
    ? await offerSpeedToLead(report.clientId)
    : DISCONNECTED_STL;

  const metrics = assembleOfferMetrics(
    {
      appDates: apps.map((a) => a.submittedAt ?? a.createdAt),
      calls,
      dealRows,
      bookings: filterCountedBookings(
        bookingRows,
        clientRow?.countedCallSources ?? null,
      ),
      reportedEmails,
      confirmations,
      eocReports,
      stl,
    },
    now,
  );

  return {
    metrics,
    report,
    apps,
    deals,
    calls,
    repName: new Map(repRows.map((r) => [r.id, r.name])),
  };
}

export type OfferHomeData = {
  metrics: OfferMetrics;
  report: ClientReport | null;
  repName: Map<string, string>;
  /** Which feed the cash mix came from, for the card's source label. */
  mixSource: "stripe" | "sheet" | null;
  /**
   * When the money feed's snapshot was written (the paySource snapshot), or
   * null for a feed-less ledger-native offer. The card renders its age so a
   * stale mirror is visible instead of passing for fresh.
   */
  moneySyncedAt: Date | null;
  /** When the funnel's (sheet) snapshot was written, or null when never. */
  funnelSyncedAt: Date | null;
  /** The window's client-layer rows — the page derives its series from these. */
  rangeRows: BacklogRow[];
  /** The offer's recent client-layer money, newest first. */
  recentRows: BacklogRow[];
  /**
   * The payment feed behind the window money (Stripe, else the sheet), or null
   * for a ledger-native offer. The page precomputes every preset window from
   * this so the hero's range chips switch instantly, client-side.
   */
  moneyFeed: WindowMoneyFeed | null;
  /** All of this offer's client-layer money rows — the ledger fallback feed. */
  clientRows: BacklogRow[];
  /** The offer's all-time collected cash, for the empty-window fallback label. */
  allTimeCashCents: number;
  /**
   * What this offer's payment tag rules took out of the dashboard feed, across
   * the whole feed (not one window). Empty when there are no rules or no feed.
   */
  tagSummary: FeedTagSummary;
};

type BacklogRow =
  ReturnType<typeof listTransactions> extends Promise<{
    rows: (infer R)[];
  }>
    ? R
    : never;

/**
 * The home surface's door into the SAME engine as /sales. It loads what the
 * dashboard renders — funnel leads, windowed payments for the mix, and the
 * window's ledger rows — and hands them to the one assembler. Sections the
 * home doesn't fetch (call activity, bookings) come back honest-empty; the
 * numbers both surfaces share can no longer be computed two ways.
 */
export async function loadOfferHome(
  slug: string,
  clientName: string,
  bounds: RangeBounds,
  todayKey: string,
): Promise<OfferHomeData> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select({
      id: clients.id,
      offerModel: clients.offerModel,
      countedCallSources: clients.countedCallSources,
    })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);

  const [
    report,
    { rows: backlog },
    snapshot,
    snaps,
    bookingRows,
    confirmations,
    calls,
    repRows,
  ] = await Promise.all([
    getClientReport(slug, clientName).catch(() => null),
    listTransactions({}),
    row ? currentSnapshot(row.id) : Promise.resolve(null),
    row ? latestSnapshotsBySource(row.id) : Promise.resolve([]),
    row
      ? db
          .select({
            id: bookings.id,
            provider: bookings.provider,
            inviteeName: bookings.inviteeName,
            inviteeEmail: bookings.inviteeEmail,
            startsAt: bookings.startsAt,
            status: bookings.status,
          })
          .from(bookings)
          .where(eq(bookings.clientId, row.id))
          .limit(500)
      : Promise.resolve([]),
    row ? listConfirmations(row.id) : Promise.resolve([]),
    // Client filter pushed into SQL (activity_logs_client_idx) instead of loading
    // every client's rows and filtering in JS. No offer row => no client => the
    // JS filter matched nothing (activity_logs.client_id is NOT NULL), so an
    // empty list is the same result.
    row ? listCallLogs(500, row.id) : Promise.resolve([]),
    row
      ? db
          .select({ id: repsTable.id, name: repsTable.name })
          .from(repsTable)
          .where(eq(repsTable.clientId, row.id))
      : Promise.resolve([]),
  ]);

  // The outcomes that clear stuck calls AND feed the confirmed-vs-unconfirmed
  // rates — the sheet's end-of-call reports.
  let reportedEmails = new Set<string>();
  let eocReports: EocReport[] | null = null;
  if (snapshot) {
    const eocRows = await db
      .select(EOC_REPORT_COLUMNS)
      .from(clientTrackingRows)
      .where(
        and(
          eq(clientTrackingRows.syncId, snapshot.syncId),
          eq(clientTrackingRows.tab, "eoc"),
        ),
      );
    reportedEmails = reportedEmailsOf(eocRows);
    eocReports = eocRows;
  }

  // Funnel: the offer's lead-stitched stages, shaped to its offer model.
  const funnelLeads = snapshot
    ? {
        leads: await leadsForClient(snapshot.syncId),
        stageKeys: stagesForModel(offerModelOf(row?.offerModel ?? null)),
      }
    : null;

  // Cash mix AND window money: processor snapshot first, sheet as the fallback
  // feed. When present, this feed OWNS the window money — its collected cash is
  // the mix's own total, so the headline equals the mix beneath it. The ledger
  // (below) is the fallback only for feed-less, ledger-native offers.
  const paySource =
    snaps.find((x) => x.source === "stripe") ??
    snaps.find((x) => x.source === "sheet") ??
    null;
  let moneyFeed: WindowMoneyFeed | null = null;
  let mixWindow = null;
  let tagSummary = emptyTagSummary();
  if (paySource && row) {
    const [{ payments: rawPayments, deals }, aliases, rules] = await Promise.all([
      cashRowsForClient(paySource.snapshot.syncId),
      aliasMapForClient(row.id),
      // Fail-soft: a rules read that throws must never take the dashboard
      // down. No rules is exactly the untagged feed.
      listTagRules(row.id).catch(() => []),
    ]);
    // The offer's tag rules decide what this dashboard counts. With no active
    // rules the feed passes through as the same array — identical figures.
    const tagged = applyTagRulesToFeed(rawPayments, rules);
    const payments = tagged.kept;
    tagSummary = tagged.summary;
    moneyFeed = { payments, deals, aliases };
    const winFrom = bounds.from ? new Date(`${bounds.from}T00:00:00Z`) : new Date(0);
    const winTo = bounds.to
      ? new Date(`${bounds.to}T23:59:59Z`)
      : new Date(`${todayKey}T23:59:59Z`);
    // The previous window, same length — the honest "vs last period" base for
    // the delta (computed from the SAME feed, not the ledger).
    const prevB = previousBounds(bounds);
    const prevFrom = prevB?.from != null ? new Date(`${prevB.from}T00:00:00Z`) : null;
    const prevTo = prevB?.to != null ? new Date(`${prevB.to}T23:59:59Z`) : null;
    mixWindow = {
      payments,
      from: winFrom,
      to: winTo,
      aliases,
      // Contracted value from the feed's own deals; a processor-only feed has
      // none, and revenue then falls back to the collected cash.
      windowRevenueCents: deals.length
        ? dealsRevenueInWindow(deals, winFrom, winTo)
        : null,
      prevCollectedCents:
        prevFrom && prevTo ? collectedInWindow(payments, prevFrom, prevTo) : null,
      prevWindowRevenueCents:
        prevFrom && prevTo && deals.length
          ? dealsRevenueInWindow(deals, prevFrom, prevTo)
          : null,
    };
  }

  // Window money: client-layer rows, attributed the way the ledger does it.
  const rangeRows = rowsForClient(
    homeRangeRows(backlog, "clients", bounds),
    report?.clientId ?? null,
    slug,
  );
  const prevB = previousBounds(bounds);
  const prevRows = prevB
    ? rowsForClient(
        homeRangeRows(backlog, "clients", prevB),
        report?.clientId ?? null,
        slug,
      )
    : null;
  const prevCash = prevRows ? prevRows.reduce((sum, r) => sum + r.cashCents, 0) : null;
  const prevRevenue = prevRows
    ? prevRows.reduce((sum, r) => sum + r.revenueCents, 0)
    : null;

  const metrics = assembleOfferMetrics(
    {
      appDates: (report?.apps ?? []).map((a) => a.submittedAt ?? a.createdAt),
      calls,
      dealRows: [],
      bookings: filterCountedBookings(bookingRows, row?.countedCallSources ?? null),
      reportedEmails,
      confirmations,
      eocReports,
      stl: DISCONNECTED_STL,
      funnelLeads,
      mixWindow,
      rangeMoney: {
        rows: rangeRows.map((r) => ({
          cashCents: r.cashCents,
          revenueCents: r.revenueCents,
        })),
        prevCash,
        prevRevenue,
      },
    },
    now,
  );

  // Every client-layer row for this offer — recent feed (top 8) AND the ledger
  // fallback the page windows per-range when there is no payment feed.
  const clientRows = rowsForClient(
    backlog.filter((r) => r.layer === "client"),
    report?.clientId ?? null,
    slug,
  );
  const recentRows = clientRows.slice(0, 8);

  return {
    metrics,
    report,
    repName: new Map(repRows.map((r) => [r.id, r.name])),
    mixSource: paySource ? (paySource.source === "stripe" ? "stripe" : "sheet") : null,
    moneySyncedAt: paySource?.snapshot.syncedAt ?? null,
    funnelSyncedAt: snapshot?.syncedAt ?? null,
    rangeRows,
    recentRows,
    moneyFeed,
    clientRows,
    allTimeCashCents: report?.mirror.cashCents ?? 0,
    tagSummary,
  };
}
