/**
 * Ad efficiency per offer — what the spend bought. Pure so ROAS and CAC are
 * computed one way everywhere. Integer cents in, integer cents out (except the
 * ROAS ratio, which is a display number rounded to two places).
 */

export interface AdRoasInput {
  spendCents: number;
  /** Cash the offer collected (the return the spend is measured against). */
  cashCents: number;
  deals: number;
  applications: number;
}

export interface AdRoas {
  /** cash ÷ spend, to 2 decimals (0 when there's no spend). */
  roas: number;
  /** spend ÷ deals — cost to acquire a customer (null with no deals). */
  cacPerDealCents: number | null;
  /** spend ÷ applications — cost per application (null with no apps). */
  cacPerAppCents: number | null;
  /** cash − spend — the raw return after the spend. */
  profitCents: number;
}

export function adRoas(i: AdRoasInput): AdRoas {
  return {
    roas: i.spendCents > 0 ? Math.round((i.cashCents / i.spendCents) * 100) / 100 : 0,
    cacPerDealCents: i.deals > 0 ? Math.round(i.spendCents / i.deals) : null,
    cacPerAppCents:
      i.applications > 0 ? Math.round(i.spendCents / i.applications) : null,
    profitCents: i.cashCents - i.spendCents,
  };
}
