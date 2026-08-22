import "server-only";

import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import { transactions, clients } from "@/db/schema/app";

/** Filtered read of the backlog — every accounting view is one of these. */
export interface BacklogFilters {
  layer?: "agency" | "client";
  direction?: "in" | "out";
  from?: string;
  to?: string;
}

export async function listTransactions(filters: BacklogFilters) {
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

  const sum = (pick: (r: (typeof rows)[number]) => number) =>
    rows.reduce((total, r) => total + pick(r), 0);
  return {
    rows,
    totals: {
      revenueCents: sum((r) => r.revenueCents),
      cashCents: sum((r) => r.cashCents),
      processorFeeCents: sum((r) => r.processorFeeCents),
    },
  };
}
