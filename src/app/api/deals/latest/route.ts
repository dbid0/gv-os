import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, offerSettings, transactions } from "@/db/schema/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The deal-closed feed (v2 §5): the newest income rows plus each offer's
 * confetti threshold. Polled by the shell; the middleware gates it like any
 * app page.
 */
export async function GET() {
  const db = getDb();
  const [rows, thresholds] = await Promise.all([
    db
      .select({
        id: transactions.id,
        recordedAt: transactions.recordedAt,
        description: transactions.description,
        dealType: transactions.dealType,
        cashCents: transactions.cashCents,
        clientId: transactions.clientId,
        clientName: clients.name,
        direction: transactions.direction,
      })
      .from(transactions)
      .leftJoin(clients, eq(transactions.clientId, clients.id))
      .where(eq(transactions.direction, "in"))
      .orderBy(desc(transactions.recordedAt))
      .limit(10),
    db
      .select({
        clientId: offerSettings.clientId,
        confettiThresholdCents: offerSettings.confettiThresholdCents,
      })
      .from(offerSettings),
  ]);

  return NextResponse.json({
    deals: rows.map((r) => ({
      id: r.id,
      recordedAt: r.recordedAt.toISOString(),
      label: r.clientName ?? r.description ?? "New close",
      dealType: r.dealType,
      cashCents: r.cashCents,
      clientId: r.clientId,
    })),
    thresholds: Object.fromEntries(
      thresholds.map((t) => [t.clientId, t.confettiThresholdCents]),
    ),
    defaultThresholdCents: 500_000,
  });
}
