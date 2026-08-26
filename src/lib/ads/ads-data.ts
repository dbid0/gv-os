import "server-only";

import { getDb } from "@/db/client";
import { clientAdSpend, clients } from "@/db/schema/app";
import { adRoas, type AdRoas } from "@/lib/ads/roas";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { dayKeyCT } from "@/lib/charts";
import { roster } from "@/lib/roster";
import { listApplications } from "@/lib/funnel/queries";
import { listDeals } from "@/lib/sales/queries";
import { clientLedger } from "@/lib/transactions/ledger";
import { listTransactions } from "@/lib/transactions/queries";

export interface AdsRow {
  slug: string;
  name: string;
  accent: string;
  spendTotalCents: number;
  spendMonthCents: number;
  cashCents: number;
  deals: number;
  applications: number;
  roas: AdRoas;
}

export interface AdsData {
  rows: AdsRow[];
  totals: {
    spendCents: number;
    cashCents: number;
    roas: AdRoas;
  };
}

/**
 * Ad efficiency across every offer that has recorded spend. Lifetime spend vs
 * the cash that offer collected, plus cost-per-deal and cost-per-application —
 * assembled from the same live reads the ledger and funnel use. Fail-soft.
 */
export async function getAdsData(): Promise<AdsData> {
  const empty: AdsData = {
    rows: [],
    totals: {
      spendCents: 0,
      cashCents: 0,
      roas: adRoas({ spendCents: 0, cashCents: 0, deals: 0, applications: 0 }),
    },
  };
  try {
    const db = getDb();
    const monthKey = dayKeyCT(new Date()).slice(0, 7);

    const [clientRows, spendRows, { rows: backlog }, deals, apps] = await Promise.all([
      db
        .select({ id: clients.id, slug: clients.slug, name: clients.name })
        .from(clients),
      db
        .select({
          clientId: clientAdSpend.clientId,
          occurredOn: clientAdSpend.occurredOn,
          amountCents: clientAdSpend.amountCents,
        })
        .from(clientAdSpend),
      listTransactions({}),
      listDeals(),
      listApplications(),
    ]);

    // Spend per DB client id → total + this month.
    const spendById = new Map<string, { total: number; month: number }>();
    for (const s of spendRows) {
      const cur = spendById.get(s.clientId) ?? { total: 0, month: 0 };
      cur.total += s.amountCents;
      if (s.occurredOn.slice(0, 7) === monthKey) cur.month += s.amountCents;
      spendById.set(s.clientId, cur);
    }

    // Cash per roster slug (all-time client-layer), the same attribution the
    // client ledger uses.
    const cashBySlug = new Map(
      clientLedger(
        backlog.filter((r) => r.layer === "client"),
        roster.map((c) => ({ slug: c.slug, name: c.name })),
        matchesSheetClient,
      ).map((l) => [l.slug, l.cashCents]),
    );

    const dealsByName = new Map<string, number>();
    for (const d of deals) {
      const name = d.teamName ?? "";
      dealsByName.set(name, (dealsByName.get(name) ?? 0) + 1);
    }
    const appsByName = new Map<string, number>();
    for (const a of apps) {
      const name = a.clientName ?? "";
      appsByName.set(name, (appsByName.get(name) ?? 0) + 1);
    }

    const rosterBySlug = new Map(roster.map((c) => [c.slug, c]));
    const rows: AdsRow[] = [];
    for (const c of clientRows) {
      const spend = spendById.get(c.id);
      if (!spend || spend.total <= 0) continue;
      const rc = rosterBySlug.get(c.slug);
      const cashCents = cashBySlug.get(c.slug) ?? 0;
      const dealsN = dealsByName.get(c.name) ?? 0;
      const appsN = appsByName.get(c.name) ?? 0;
      rows.push({
        slug: c.slug,
        name: c.name,
        accent: rc?.accent ?? "var(--brand)",
        spendTotalCents: spend.total,
        spendMonthCents: spend.month,
        cashCents,
        deals: dealsN,
        applications: appsN,
        roas: adRoas({
          spendCents: spend.total,
          cashCents,
          deals: dealsN,
          applications: appsN,
        }),
      });
    }
    rows.sort((a, b) => b.spendTotalCents - a.spendTotalCents);

    const spendCents = rows.reduce((s, r) => s + r.spendTotalCents, 0);
    const cashCents = rows.reduce((s, r) => s + r.cashCents, 0);
    const totalDeals = rows.reduce((s, r) => s + r.deals, 0);
    const totalApps = rows.reduce((s, r) => s + r.applications, 0);
    return {
      rows,
      totals: {
        spendCents,
        cashCents,
        roas: adRoas({
          spendCents,
          cashCents,
          deals: totalDeals,
          applications: totalApps,
        }),
      },
    };
  } catch {
    return empty;
  }
}
