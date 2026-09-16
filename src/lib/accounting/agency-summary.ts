/**
 * THE AGENCY BOOK, as Daniel and Gus already read it.
 *
 * This is a replication, not a design: the Master Finance Sheet's summary block
 * is the shape the two of them actually run the agency off, so GV OS shows the
 * same rows in the same order with the same names. Three periods across, two
 * sections down. (Spec: global-ventures/gv-os/AGENCY-ACCOUNTING-SPEC.md.)
 *
 * It is built on `sheet-mirror`'s `computeDeal`, which is already penny-exact
 * against that sheet, so the summary cannot drift from the book it mirrors.
 *
 * Two rules the sheet encodes that are easy to get wrong:
 *
 * - **AR and unpaid payouts are BALANCES, not flows.** The sheet leaves their
 *   monthly cells blank on purpose: "AR this month" is not a meaningful number,
 *   because the debt was booked whenever it was booked. They are all-time only,
 *   and a monthly figure would be invented.
 *
 * - **A row can carry $0 revenue and real cash.** That is an installment paid
 *   against a contract booked on an earlier row. Revenue and cash are summed
 *   independently; pairing them per row would double-count the contract.
 *
 * Pure: no database, no clock (the caller passes today).
 */

import { computeDeal, type MirrorDealInput } from "@/lib/accounting/sheet-mirror";

/**
 * A partner's share of one month, as the payouts book recorded it.
 *
 * These are READ, never recomputed here. The per-deal split runs 30/40/45/50
 * across the back catalogue and is not stored on the transaction, so deriving
 * it from a default would quietly restate most of the book. The payouts table
 * holds what was actually apportioned.
 *
 * `partner` is data, not a constant: this module never names Daniel or Gus, so
 * a third partner needs no code change.
 */
export interface PartnerPayoutRow {
  /** yyyy-mm. */
  month: string;
  partner: string;
  cents: number;
  /** "paid" = out the door. Anything else counts as still owed. */
  status: string;
}

export const PAID_STATUS = "paid";

export type SummaryValue = number | null;

export interface SummaryRow {
  key: string;
  label: string;
  /** money = cents, count = a plain number. */
  kind: "money" | "count";
  /** A balance, not a flow: all-time only, monthly cells stay blank. */
  balanceOnly: boolean;
  thisMonth: SummaryValue;
  lastMonth: SummaryValue;
  allTime: SummaryValue;
}

export interface SummarySection {
  label: string;
  rows: SummaryRow[];
}

export interface AgencySummary {
  /** yyyy-mm of the two named columns, so the UI can label them honestly. */
  thisMonthKey: string;
  lastMonthKey: string;
  sections: SummarySection[];
}

const monthOf = (dateClosed: string) => dateClosed.slice(0, 7);

/** The yyyy-mm before this one, across a year boundary. */
export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

type Totals = {
  revenueCents: number;
  cashCents: number;
  feeCents: number;
  netCents: number;
  deals: number;
};

const empty = (): Totals => ({
  revenueCents: 0,
  cashCents: 0,
  feeCents: 0,
  netCents: 0,
  deals: 0,
});

function add(into: Totals, deal: MirrorDealInput): Totals {
  const c = computeDeal(deal);
  into.revenueCents += deal.revenueCents;
  into.cashCents += deal.cashCents;
  into.feeCents += c.feeCents;
  into.netCents += c.netCents;
  into.deals += 1;
  return into;
}

export function agencySummary(
  deals: MirrorDealInput[],
  /** The payouts book — what each partner was actually apportioned. */
  partnerPayouts: PartnerPayoutRow[],
  /** Today as yyyy-mm-dd, in the reader's zone — the caller owns the clock. */
  todayKey: string,
): AgencySummary {
  const thisMonthKey = todayKey.slice(0, 7);
  const lastMonthKey = previousMonthKey(thisMonthKey);

  const all = empty();
  const now = empty();
  const prev = empty();
  let arCents = 0;

  for (const deal of deals) {
    add(all, deal);
    const month = monthOf(deal.dateClosed);
    if (month === thisMonthKey) add(now, deal);
    else if (month === lastMonthKey) add(prev, deal);

    // A balance accumulates over the whole book, whatever month it was booked.
    arCents += computeDeal(deal).arCents;
  }

  // One row per partner the book actually names, in a stable order.
  const partners = [...new Set(partnerPayouts.map((p) => p.partner))].sort((a, b) =>
    a.localeCompare(b),
  );
  const partnerTotal = (partner: string, month: string | null) =>
    partnerPayouts
      .filter((p) => p.partner === partner && (month === null || p.month === month))
      .reduce((n, p) => n + p.cents, 0);
  const unpaidCents = partnerPayouts
    .filter((p) => p.status.trim().toLowerCase() !== PAID_STATUS)
    .reduce((n, p) => n + p.cents, 0);

  const flow = (
    key: string,
    label: string,
    pick: (t: Totals) => number,
    kind: "money" | "count" = "money",
  ): SummaryRow => ({
    key,
    label,
    kind,
    balanceOnly: false,
    thisMonth: pick(now),
    lastMonth: pick(prev),
    allTime: pick(all),
  });

  const balance = (key: string, label: string, value: number): SummaryRow => ({
    key,
    label,
    kind: "money",
    balanceOnly: true,
    thisMonth: null,
    lastMonth: null,
    allTime: value,
  });

  return {
    thisMonthKey,
    lastMonthKey,
    sections: [
      {
        label: "Revenue & cash",
        rows: [
          flow("revenue", "Revenue generated", (t) => t.revenueCents),
          flow("cash", "Cash collected (gross)", (t) => t.cashCents),
          flow("fees", "Processor fees paid", (t) => t.feeCents),
          flow("net", "Net cash collected", (t) => t.netCents),
          balance("ar", "Outstanding AR", arCents),
          flow("deals", "Deals closed", (t) => t.deals, "count"),
        ],
      },
      {
        label: "Partner payouts",
        rows: [
          ...partners.map((partner) => ({
            key: `partner:${partner}`,
            label: `${partner} payout`,
            kind: "money" as const,
            balanceOnly: false,
            thisMonth: partnerTotal(partner, thisMonthKey),
            lastMonth: partnerTotal(partner, lastMonthKey),
            allTime: partnerTotal(partner, null),
          })),
          balance("unpaid", "Unpaid payouts", unpaidCents),
        ],
      },
    ],
  };
}
