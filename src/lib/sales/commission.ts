/**
 * Sales commissions.
 *
 * A rep earns a percentage of a deal — of the cash actually collected, or of the
 * deal's revenue, depending on the plan. On top of that a rep may carry a fixed
 * base and a bonus, and a manager may take a "top-line skim" across the whole
 * team's deals. This is the arithmetic behind RepVision's Commissions table,
 * expressed as pure functions in integer cents so a payout run reconciles to the
 * penny and nothing is ever computed with a float.
 *
 * It deliberately mirrors the accounting side: rates are whole basis points, all
 * money is cents, and a rollup is a sum of per-deal amounts rather than a
 * percentage of a total — so rounding never drifts between the line items and
 * the total a rep is actually paid.
 */

import { type Cents, applyBps, add, sum, ZERO } from "@/lib/money";
import { type Bps } from "@/lib/splits";

/** What a commission is calculated on. */
export type CommissionBasis = "cash_collected" | "deal_revenue";

/** The two amounts a deal can pay commission on. */
export interface DealAmounts {
  cashCollectedCents: Cents;
  revenueCents: Cents;
}

/** The amount a commission is taken on, per the plan's basis. */
export function basisAmount(deal: DealAmounts, basis: CommissionBasis): Cents {
  return basis === "cash_collected" ? deal.cashCollectedCents : deal.revenueCents;
}

/** One rep's commission on one deal: rate × basis, rounded half away from zero. */
export function commissionOnDeal(
  deal: DealAmounts,
  rateBps: Bps,
  basis: CommissionBasis,
): Cents {
  if (rateBps < 0) {
    throw new RangeError(`commission rate cannot be negative, received ${rateBps} bps`);
  }
  return applyBps(basisAmount(deal, basis), rateBps);
}

/** A participant's deal at their rate — the input to a commission run. */
export interface RunDeal {
  deal: DealAmounts;
  rateBps: Bps;
}

/** Fixed additions to a run that are not a per-deal percentage. */
export interface RunExtras {
  /** A fixed base owed regardless of deals. */
  baseCents?: Cents;
  /** A one-off bonus. */
  bonusCents?: Cents;
}

/** One line of a commission run — a rep's owed position for the period. */
export interface CommissionRun {
  dealCount: number;
  cashCollectedCents: Cents;
  revenueCents: Cents;
  commissionCents: Cents;
  baseCents: Cents;
  bonusCents: Cents;
  totalOwedCents: Cents;
}

/**
 * Rolls up a participant's deals into one owed line.
 *
 * The commission is the SUM of each deal's commission, not a percentage of the
 * summed basis, because a rep is paid per deal and each is rounded to a real
 * cent. Total owed = commission + base + bonus.
 */
export function commissionRun(
  deals: readonly RunDeal[],
  basis: CommissionBasis,
  extras: RunExtras = {},
): CommissionRun {
  const cashCollectedCents = sum(deals.map((d) => d.deal.cashCollectedCents));
  const revenueCents = sum(deals.map((d) => d.deal.revenueCents));
  const commissionCents = sum(
    deals.map((d) => commissionOnDeal(d.deal, d.rateBps, basis)),
  );
  const baseCents = extras.baseCents ?? ZERO;
  const bonusCents = extras.bonusCents ?? ZERO;

  return {
    dealCount: deals.length,
    cashCollectedCents,
    revenueCents,
    commissionCents,
    baseCents,
    bonusCents,
    totalOwedCents: add(commissionCents, baseCents, bonusCents),
  };
}

/**
 * A manager's top-line skim: a percentage of the team's total cash (or revenue),
 * taken once across the whole team rather than per rep. Managers do not close,
 * so their owed line is just the skim.
 */
export function topLineSkim(
  teamTotals: DealAmounts,
  rateBps: Bps,
  basis: CommissionBasis,
): Cents {
  if (rateBps < 0) {
    throw new RangeError(`skim rate cannot be negative, received ${rateBps} bps`);
  }
  return applyBps(basisAmount(teamTotals, basis), rateBps);
}
