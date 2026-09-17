import "server-only";

import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { bookings, clients, offerSettings } from "@/db/schema/app";
import { resolveEmail } from "@/lib/tracking/aliases";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";
import { cashCatalog, type CashCatalog } from "@/lib/tracking/cash-catalog";
import { ticketSplit, type TicketSplit } from "@/lib/tracking/ticket-split";
import { cashRowsForClient, latestSnapshotsBySource } from "@/lib/tracking/queries";
import { listTagRules } from "@/lib/tracking/tag-rules-store";
import { boundsToDates } from "@/lib/tracking/window-money";
import type { RangeBounds } from "@/lib/transactions/homepage";

export type CashCatalogData = {
  /** Counted cash split at the offer's low-ticket line. Null = no line set. */
  ticket: TicketSplit | null;
  /** Which feed the cash came from: the processor snapshot, else the sheet. */
  source: "stripe" | "sheet" | null;
  syncedAt: Date | null;
  catalog: CashCatalog | null;
};

/**
 * An offer's cash catalog, read the way the workspace dashboard reads its
 * headline: the same feed choice (Stripe snapshot first, sheet as fallback),
 * the same tag rules, the same alias map and the same window instants, so the
 * two can't disagree about cash collected.
 */
export async function loadCashCatalog(
  clientId: string,
  bounds: RangeBounds,
  todayKey: string,
  timeZone: string,
): Promise<CashCatalogData> {
  const db = getDb();
  const snaps = await latestSnapshotsBySource(clientId);
  const paySource =
    snaps.find((x) => x.source === "stripe") ??
    snaps.find((x) => x.source === "sheet") ??
    null;
  if (!paySource) return { source: null, syncedAt: null, catalog: null, ticket: null };

  const [{ payments, deals }, aliases, rules, [fee], firstCalls, [offer]] =
    await Promise.all([
      cashRowsForClient(paySource.snapshot.syncId),
      aliasMapForClient(clientId),
      // Same fail-soft as the dashboard: a rules read that throws is no rules.
      listTagRules(clientId).catch(() => []),
      db
        .select({
          bps: clients.processorFeeBps,
          flatCents: clients.processorFeeFlatCents,
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1),
      db
        .select({
          email: sql<string>`lower(${bookings.inviteeEmail})`,
          firstAt: sql<Date>`min(${bookings.startsAt})`,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.clientId, clientId),
            ne(bookings.status, "canceled"),
            isNotNull(bookings.inviteeEmail),
            isNotNull(bookings.startsAt),
          ),
        )
        .groupBy(sql`lower(${bookings.inviteeEmail})`),
      // The offer's own low-ticket line. Absent = no split is shown at all.
      getDb()
        .select({ lowTicketMaxCents: offerSettings.lowTicketMaxCents })
        .from(offerSettings)
        .where(eq(offerSettings.clientId, clientId))
        .limit(1),
    ]);

  // Keyed through the alias map, like the payer: someone who booked from one
  // inbox and paid from another still had a call before paying.
  const firstCallAt = new Map<string, Date>();
  for (const r of firstCalls) {
    const key = resolveEmail(r.email, aliases);
    if (!key) continue;
    const at = new Date(r.firstAt);
    const prev = firstCallAt.get(key);
    if (!prev || at < prev) firstCallAt.set(key, at);
  }

  const { from, to } = boundsToDates(bounds, todayKey, timeZone);
  return {
    source: paySource.source === "stripe" ? "stripe" : "sheet",
    syncedAt: paySource.snapshot.syncedAt,
    // Counted cash, split at the offer's line. The catalog itself stays
    // undivided — this is a reading of it, not a change to it.
    ticket: ticketSplit(
      // The same window the catalog counts, so the split can never total to a
      // different figure than the cash it is splitting.
      payments
        .filter(
          (p) => p.occurredAt !== null && p.occurredAt >= from && p.occurredAt <= to,
        )
        // A row with no amount cannot be banded; it is not a $0 sale.
        .filter((p): p is typeof p & { cashCents: number } => p.cashCents !== null),
      offer?.lowTicketMaxCents ?? null,
    ),
    catalog: cashCatalog({
      payments,
      rules,
      from,
      to,
      timeZone,
      aliases,
      firstCallAt,
      fee: fee ?? null,
      deals,
    }),
  };
}
