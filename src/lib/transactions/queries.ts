import "server-only";

import { cache } from "react";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import { summarizeBacklog } from "@/lib/transactions/summary";
import { transactions, clients } from "@/db/schema/app";

/** Filtered read of the backlog — every accounting view is one of these. */
export interface BacklogFilters {
  layer?: "agency" | "client";
  direction?: "in" | "out";
  from?: string;
  to?: string;
}

async function loadTransactions(filters: BacklogFilters) {
  const db = getDb();
  const where: SQL[] = [];
  if (filters.layer) where.push(eq(transactions.layer, filters.layer));
  if (filters.direction) where.push(eq(transactions.direction, filters.direction));
  if (filters.from) where.push(gte(transactions.occurredOn, filters.from));
  if (filters.to) where.push(lte(transactions.occurredOn, filters.to));

  const rows = await db
    .select({
      id: transactions.id,
      occurredOn: transactions.occurredOn,
      direction: transactions.direction,
      layer: transactions.layer,
      clientId: transactions.clientId,
      clientName: clients.name,
      dealType: transactions.dealType,
      description: transactions.description,
      paymentMethod: transactions.paymentMethod,
      revenueCents: transactions.revenueCents,
      cashCents: transactions.cashCents,
      processorFeeCents: transactions.processorFeeCents,
      source: transactions.source,
      external: transactions.external,
    })
    .from(transactions)
    .leftJoin(clients, eq(transactions.clientId, clients.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(transactions.occurredOn), desc(transactions.recordedAt))
    .limit(500);

  // Direction is respected by `summarizeBacklog`, not here: money in and money
  // out are different directions and adding them is not a total of anything.
  return { rows, totals: summarizeBacklog(rows) };
}

// Per-request dedupe: heavy pages (dashboard, brief, accounting, sales) can
// end up calling the same filter combination more than once per render via
// independent loaders. React's cache() keys on argument identity though, so
// caching this function directly on the `filters` OBJECT would not work —
// every call site builds a fresh object literal (`listTransactions({})`),
// so two calls with an identical *shape* would still be a cache miss and
// re-run the query. Passing the four primitive fields instead lets cache()
// correctly recognize identical filter combinations across call sites.
//
// This is request-scoped only (Next.js resets React's cache() per request),
// so it can never serve a stale figure across requests — it only avoids
// re-scanning the backlog more than once within the same render.
const loadTransactionsCached = cache(
  (
    layer: BacklogFilters["layer"],
    direction: BacklogFilters["direction"],
    from: BacklogFilters["from"],
    to: BacklogFilters["to"],
  ) => loadTransactions({ layer, direction, from, to }),
);

export async function listTransactions(filters: BacklogFilters) {
  return loadTransactionsCached(
    filters.layer,
    filters.direction,
    filters.from,
    filters.to,
  );
}
