/**
 * THE AGENCY BOOK, as Daniel and Gus already read it.
 *
 * A replication of the Master Finance Sheet's summary block — three periods
 * across, two sections down, the sheet's own rows in the sheet's order.
 * (Spec: global-ventures/gv-os/AGENCY-ACCOUNTING-SPEC.md.)
 *
 * Every figure comes off the DEAL ROWS, exactly as the sheet's own summary
 * formulas do, bucketed by each row's Date Closed:
 *
 *   Revenue generated       Σ revenue
 *   Cash collected (gross)  Σ cash
 *   Processor fees paid     Σ fee
 *   Net cash collected      Σ net
 *   Outstanding AR          Σ AR                       (all time only)
 *   Deals closed            row count
 *   Daniel payout           Σ Daniel's share of net
 *   Gus payout              Σ Gus's share of net
 *   Unpaid payouts          Σ (Daniel + Gus) where Payout Status = "Not Yet"
 *                                                      (all time only)
 *
 * PARTNER SHARES ARE PER DEAL. The back catalogue runs 30/40/45/50, which is
 * why all-time Daniel and Gus differ. The mirror computes each row's split
 * with that row's own percentage, so the summary reads it off the row. An
 * earlier version read a separate payouts table instead and the partner
 * section came out wrong — that table is not what the sheet sums.
 *
 * AR and unpaid are BALANCES: the sheet leaves their monthly cells blank on
 * purpose, and so does this.
 *
 * A row can carry $0 revenue and real cash — an installment against a contract
 * booked on an earlier row. Revenue and cash are summed independently, as the
 * sheet does, so the contract is never counted twice.
 *
 * Pure: no database, no clock (the caller passes today).
 */

/** One deal row, with the figures the mirror reconciled for it. */
export interface BookDeal {
  /** yyyy-mm-dd — the sheet's Date Closed, which is what it buckets on. */
  dateClosed: string;
  revenueCents: number;
  cashCents: number;
  feeCents: number;
  netCents: number;
  /** Still owed on this deal's contract. */
  arCents: number;
  /** This deal's share of net, at this deal's own percentage. */
  danielCents: number;
  gusCents: number;
  /** As typed in the sheet: "Paid Out", "Pending", "Not Yet". */
  payoutStatus: string;
}

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

/** The sheet's wording for a payout that has not gone out. */
export const UNPAID_STATUS = "not yet";

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
  danielCents: number;
  gusCents: number;
  deals: number;
};

const empty = (): Totals => ({
  revenueCents: 0,
  cashCents: 0,
  feeCents: 0,
  netCents: 0,
  danielCents: 0,
  gusCents: 0,
  deals: 0,
});

function add(into: Totals, d: BookDeal): void {
  into.revenueCents += d.revenueCents;
  into.cashCents += d.cashCents;
  into.feeCents += d.feeCents;
  into.netCents += d.netCents;
  into.danielCents += d.danielCents;
  into.gusCents += d.gusCents;
  into.deals += 1;
}

export function agencySummary(deals: BookDeal[], todayKey: string): AgencySummary {
  const thisMonthKey = todayKey.slice(0, 7);
  const lastMonthKey = previousMonthKey(thisMonthKey);

  const all = empty();
  const now = empty();
  const prev = empty();
  let arCents = 0;
  let unpaidCents = 0;

  for (const d of deals) {
    add(all, d);
    const month = d.dateClosed.slice(0, 7);
    if (month === thisMonthKey) add(now, d);
    else if (month === lastMonthKey) add(prev, d);

    arCents += d.arCents;
    // The sheet's casing and spacing are not reliable; the meaning is.
    if (d.payoutStatus.trim().toLowerCase() === UNPAID_STATUS) {
      unpaidCents += d.danielCents + d.gusCents;
    }
  }

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
          flow("daniel", "Daniel payout", (t) => t.danielCents),
          flow("gus", "Gus payout", (t) => t.gusCents),
          balance("unpaid", "Unpaid payouts", unpaidCents),
        ],
      },
    ],
  };
}
