import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clientAdSpend } from "@/db/schema/app";
import { adSpendByClientMonth } from "@/lib/revshare/ad-spend";

/** clientId:yyyy-mm → total ad spend, for the rev-share engine's deduction. */
export async function getAdSpendByMonth(): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      clientId: clientAdSpend.clientId,
      occurredOn: clientAdSpend.occurredOn,
      amountCents: clientAdSpend.amountCents,
    })
    .from(clientAdSpend);
  return adSpendByClientMonth(rows);
}

export interface AdSpendEntry {
  id: string;
  occurredOn: string;
  amountCents: number;
  note: string | null;
}

/** An offer's ad-spend entries, newest first, plus the running total. */
export async function listAdSpendForClient(clientId: string): Promise<{
  entries: AdSpendEntry[];
  totalCents: number;
}> {
  const db = getDb();
  const entries = await db
    .select({
      id: clientAdSpend.id,
      occurredOn: clientAdSpend.occurredOn,
      amountCents: clientAdSpend.amountCents,
      note: clientAdSpend.note,
    })
    .from(clientAdSpend)
    .where(eq(clientAdSpend.clientId, clientId))
    .orderBy(desc(clientAdSpend.occurredOn))
    .limit(50);
  return {
    entries,
    totalCents: entries.reduce((s, e) => s + e.amountCents, 0),
  };
}
