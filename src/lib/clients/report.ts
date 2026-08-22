import "server-only";

import { and, count, desc, eq, gte } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  applications,
  bookings,
  clients,
  crmActivity,
  kitSnapshots,
  paymentEvents,
  sheetMirrorDeals,
  sheetSyncRuns,
  signedDocs,
} from "@/db/schema/app";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";

/**
 * Everything one client's report page needs, in one pass. Capture tables join
 * by client id; the finance mirror joins by NAME through the tested alias
 * table, because the sheet stores human names — that matching is labeled in
 * the UI, never silent.
 */

export interface ClientReport {
  clientId: string | null;
  apps: { submittedAt: Date | null; createdAt: Date }[];
  apps30d: number;
  kit: {
    accountName: string | null;
    sequenceCount: number;
    tagCount: number;
    takenAt: Date;
  } | null;
  captures: { crm: number; payments: number; bookings: number; signedDocs: number };
  mirror: { deals: number; netCents: number; cashCents: number };
}

export async function getClientReport(
  slug: string,
  displayName: string,
): Promise<ClientReport> {
  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  const clientId = row?.id ?? null;

  const daysAgo30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const empty = {
    clientId,
    apps: [] as { submittedAt: Date | null; createdAt: Date }[],
    apps30d: 0,
    kit: null,
    captures: { crm: 0, payments: 0, bookings: 0, signedDocs: 0 },
    mirror: { deals: 0, netCents: 0, cashCents: 0 },
  };

  const [appRows, [kitRow], [crm], [pay], [book], [signed]] = clientId
    ? await Promise.all([
        db
          .select({
            submittedAt: applications.submittedAt,
            createdAt: applications.createdAt,
          })
          .from(applications)
          .where(
            and(
              eq(applications.clientId, clientId),
              gte(applications.createdAt, daysAgo30),
            ),
          ),
        db
          .select({
            accountName: kitSnapshots.accountName,
            sequenceCount: kitSnapshots.sequenceCount,
            tagCount: kitSnapshots.tagCount,
            takenAt: kitSnapshots.takenAt,
          })
          .from(kitSnapshots)
          .where(eq(kitSnapshots.clientId, clientId))
          .orderBy(desc(kitSnapshots.takenAt))
          .limit(1),
        db
          .select({ n: count() })
          .from(crmActivity)
          .where(eq(crmActivity.clientId, clientId)),
        db
          .select({ n: count() })
          .from(paymentEvents)
          .where(eq(paymentEvents.clientId, clientId)),
        db.select({ n: count() }).from(bookings).where(eq(bookings.clientId, clientId)),
        db
          .select({ n: count() })
          .from(signedDocs)
          .where(eq(signedDocs.clientId, clientId)),
      ])
    : [[], [undefined], [undefined], [undefined], [undefined], [undefined]];

  // Finance mirror: latest run, matched by name aliases.
  const [run] = await db
    .select({ id: sheetSyncRuns.id })
    .from(sheetSyncRuns)
    .orderBy(desc(sheetSyncRuns.createdAt))
    .limit(1);
  let mirror = empty.mirror;
  if (run) {
    const mirrorRows = await db
      .select({
        client: sheetMirrorDeals.client,
        cashCents: sheetMirrorDeals.cashCents,
        figures: sheetMirrorDeals.figures,
      })
      .from(sheetMirrorDeals)
      .where(eq(sheetMirrorDeals.runId, run.id));
    const mine = mirrorRows.filter((r) => matchesSheetClient(slug, r.client));
    mirror = {
      deals: mine.length,
      cashCents: mine.reduce((sum, r) => sum + r.cashCents, 0),
      netCents: mine.reduce((sum, r) => sum + (r.figures.ours.netCents ?? 0), 0),
    };
  }

  void displayName;
  return {
    clientId,
    apps: appRows,
    apps30d: appRows.length,
    kit: kitRow ?? null,
    captures: {
      crm: crm?.n ?? 0,
      payments: pay?.n ?? 0,
      bookings: book?.n ?? 0,
      signedDocs: signed?.n ?? 0,
    },
    mirror,
  };
}
