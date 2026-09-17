import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { payouts } from "@/db/schema/app";
import {
  agencySummary,
  type AgencySummary,
  type BookDeal,
  type PartnerPayoutRow,
} from "@/lib/accounting/agency-summary";
import { latestReconciliation } from "@/lib/accounting/sheet-sync";

/**
 * The agency book — the ONE read behind the Accounting front page.
 *
 * Both halves come from the system of record rather than being recomputed:
 * the deals are the finance-sheet mirror's latest reconciled run, and the
 * partner shares are the payouts book. Accounting can therefore only ever show
 * what the sheet and the payout ledger already agree on.
 *
 * Fail-soft, like the rest of the read layer: a database hiccup returns an
 * empty book, which renders as zeros and dashes, not a broken page.
 */
export async function agencyBook(todayKey: string): Promise<AgencySummary> {
  let deals: BookDeal[] = [];
  let partnerRows: PartnerPayoutRow[] = [];

  try {
    const { deals: mirrored } = await latestReconciliation();
    deals = mirrored.map((d) => ({
      dateClosed: d.dateClosed,
      revenueCents: d.revenueCents,
      cashCents: d.cashCents,
      // `figures.ours` is GV OS's own chain for that row, already reconciled
      // against the sheet. A missing figure is 0 for the SUM, never invented.
      feeCents: d.figures?.ours?.feeCents ?? 0,
      netCents: d.figures?.ours?.netCents ?? 0,
      arCents: d.figures?.ours?.arCents ?? 0,
    }));
  } catch {
    /* no mirror run yet — the book reads empty */
  }

  try {
    const rows = await getDb()
      .select({
        month: payouts.month,
        label: payouts.label,
        baseCents: payouts.baseCents,
        status: payouts.status,
      })
      .from(payouts)
      .where(eq(payouts.kind, "partner"));
    partnerRows = rows.map((r) => ({
      month: r.month,
      // The partner is whatever the book calls them — never a name in code.
      partner: r.label,
      cents: r.baseCents,
      status: r.status,
    }));
  } catch {
    /* no payouts yet — the partner rows read empty */
  }

  return agencySummary(deals, partnerRows, todayKey);
}
