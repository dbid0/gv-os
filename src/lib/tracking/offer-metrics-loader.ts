import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  applications,
  bookings,
  clientTrackingRows,
  reps as repsTable,
} from "@/db/schema/app";
import { getClientReport, type ClientReport } from "@/lib/clients/report";
import { listConfirmations } from "@/lib/crm/confirmation-store";
import { offerSpeedToLead, type OfferStl } from "@/lib/crm/offer-stl";
import { listCallLogs } from "@/lib/sales/call-queries";
import { listDeals } from "@/lib/sales/queries";
import { assembleOfferMetrics, type OfferMetrics } from "@/lib/tracking/offer-metrics";
import { cashRowsForClient, currentSnapshot } from "@/lib/tracking/queries";

const DISCONNECTED_STL: OfferStl = {
  connected: false,
  medianMinutes: null,
  slaPct: null,
  measured: 0,
  applications: 0,
  everDialed: 0,
  byRep: [],
};

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

  const [apps, allCalls, allDeals, report, repRows, bookingRows, confirmations] =
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
      listCallLogs(500),
      listDeals(),
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

  const calls = allCalls.filter((c) => c.clientId === clientId);
  const deals = allDeals.filter((d) => d.clientId === clientId);

  // Second wave — rows that hang off the current tracking snapshot: the
  // deals tab (paid-mix strip) and the EOC emails that clear stuck calls.
  let dealRows: {
    cashCents: number | null;
    revenueCents: number | null;
    label: string | null;
  }[] = [];
  let reportedEmails = new Set<string>();
  if (report?.clientId) {
    const snap = await currentSnapshot(report.clientId);
    if (snap) {
      const [{ deals: snapDeals }, eocRows] = await Promise.all([
        cashRowsForClient(snap.syncId),
        db
          .select({ email: clientTrackingRows.email })
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
      reportedEmails = new Set(
        eocRows
          .map((r) => r.email?.trim().toLowerCase())
          .filter((e): e is string => Boolean(e)),
      );
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
      bookings: bookingRows,
      reportedEmails,
      confirmations,
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
