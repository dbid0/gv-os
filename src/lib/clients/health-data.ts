import "server-only";

import { dayKeyCT } from "@/lib/charts";
import {
  clientHealth,
  type ClientHealth,
  type ClientHealthInput,
} from "@/lib/clients/health";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { listApplications } from "@/lib/funnel/queries";
import { roster } from "@/lib/roster";
import { listActivityReports, listEodReps } from "@/lib/sales/queries";
import { clientLedger } from "@/lib/transactions/ledger";
import {
  homeRangeRows,
  rangeBounds,
  type RangeBounds,
} from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";

export interface ClientHealthRow {
  slug: string;
  name: string;
  accent: string;
  input: ClientHealthInput;
  health: ClientHealth;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Assemble every offer's health from the same live reads the rest of the app
 * uses — cash by client this month vs last (client ledger), applications in
 * (funnel), and EOD activity (reps). Sorted worst-first so an at-risk offer is
 * the first thing you see. Fail-soft: a query hiccup returns an empty list, not
 * a broken page.
 */
export async function getClientHealthData(): Promise<ClientHealthRow[]> {
  try {
    const now = new Date();
    const todayKey = dayKeyCT(now);
    const [y, m] = todayKey.split("-").map(Number);
    const thisMonth = rangeBounds("month", todayKey);
    const lastY = m === 1 ? y - 1 : y;
    const lastM = m === 1 ? 12 : m - 1;
    const lastDays = new Date(Date.UTC(lastY, lastM, 0)).getUTCDate();
    const lastMonth: RangeBounds = {
      from: `${lastY}-${pad(lastM)}-01`,
      to: `${lastY}-${pad(lastM)}-${pad(lastDays)}`,
      label: "Last month",
    };

    const [{ rows: backlog }, apps, reports, reps] = await Promise.all([
      listTransactions({}),
      listApplications(),
      listActivityReports("eod"),
      listEodReps(),
    ]);

    const rosterSimple = roster.map((c) => ({ slug: c.slug, name: c.name }));
    const cashThis = new Map(
      clientLedger(
        homeRangeRows(backlog, "clients", thisMonth),
        rosterSimple,
        matchesSheetClient,
      ).map((l) => [l.slug, l.cashCents]),
    );
    const cashLast = new Map(
      clientLedger(
        homeRangeRows(backlog, "clients", lastMonth),
        rosterSimple,
        matchesSheetClient,
      ).map((l) => [l.slug, l.cashCents]),
    );

    const ms7 = now.getTime() - 7 * 86_400_000;
    const ms30 = now.getTime() - 30 * 86_400_000;
    const apps7 = new Map<string, number>();
    const apps30 = new Map<string, number>();
    for (const a of apps) {
      const t = (a.submittedAt ?? a.createdAt).getTime();
      const name = a.clientName ?? "";
      if (t >= ms30) apps30.set(name, (apps30.get(name) ?? 0) + 1);
      if (t >= ms7) apps7.set(name, (apps7.get(name) ?? 0) + 1);
    }
    const eod7 = new Map<string, number>();
    for (const r of reports) {
      if (new Date(r.reportDate).getTime() >= ms7) {
        const name = r.teamName ?? "";
        eod7.set(name, (eod7.get(name) ?? 0) + 1);
      }
    }
    const repCount = new Map<string, number>();
    for (const rp of reps) {
      const name = rp.teamName ?? "";
      repCount.set(name, (repCount.get(name) ?? 0) + 1);
    }

    return roster
      .map((c) => {
        const input: ClientHealthInput = {
          cashThisMonthCents: cashThis.get(c.slug) ?? 0,
          cashLastMonthCents: cashLast.get(c.slug) ?? 0,
          apps30d: apps30.get(c.name) ?? 0,
          apps7d: apps7.get(c.name) ?? 0,
          eodsLast7d: eod7.get(c.name) ?? 0,
          activeReps: repCount.get(c.name) ?? 0,
        };
        return {
          slug: c.slug,
          name: c.name,
          accent: c.accent,
          input,
          health: clientHealth(input),
        };
      })
      .sort((a, b) => a.health.score - b.health.score);
  } catch {
    return [];
  }
}
