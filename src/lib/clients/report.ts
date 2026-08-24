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
  signedDocs,
} from "@/db/schema/app";
import { dayKeyCT } from "@/lib/charts";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { roster } from "@/lib/roster";
import { clientLedger } from "@/lib/transactions/ledger";
import { listTransactions } from "@/lib/transactions/queries";

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
  mirror: { deals: number; netCents: number; cashCents: number; revenueCents: number };
  target: { monthlyTargetCents: number | null; mtdCashCents: number };
}

export async function getClientReport(
  slug: string,
  displayName: string,
): Promise<ClientReport> {
  const db = getDb();
  const [row] = await db
    .select({ id: clients.id, monthlyTargetCents: clients.monthlyTargetCents })
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
    mirror: { deals: 0, netCents: 0, cashCents: 0, revenueCents: 0 },
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

  // Money is derived from the unified transactions backlog — the single source
  // of truth (v2 §4) — not the retired finance mirror. Client-layer rows only
  // (this offer's own gross cash), attributed to the offer at read time by the
  // same tested helper the client ledger uses, so the number here always agrees
  // with /accounting/clients. "Net after fees" = cash minus processor fees. The
  // new-deal importer and processor feeds write these rows, so imported deals
  // appear the moment they land — no separate mirror to fall out of sync.
  const { rows: clientRows } = await listTransactions({ layer: "client" });
  const rosterLite = roster.map((c) => ({ slug: c.slug, name: c.name }));
  const line = clientLedger(clientRows, rosterLite, matchesSheetClient).find(
    (l) => l.slug === slug,
  );
  const mirror = line
    ? {
        deals: line.count,
        cashCents: line.cashCents,
        revenueCents: line.revenueCents,
        netCents: line.afterFeesCents,
      }
    : empty.mirror;

  // Month-to-date cash for the offer's target: the same attribution, narrowed
  // to the current CT month.
  const month = dayKeyCT(new Date()).slice(0, 7);
  const monthRows = clientRows.filter((r) => r.occurredOn.slice(0, 7) === month);
  const mtdCashCents =
    clientLedger(monthRows, rosterLite, matchesSheetClient).find((l) => l.slug === slug)
      ?.cashCents ?? 0;

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
    target: {
      monthlyTargetCents: row?.monthlyTargetCents ?? null,
      mtdCashCents,
    },
  };
}
