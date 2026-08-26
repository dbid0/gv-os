import type { RepOwedLine } from "@/lib/sales/commission-rollup";

/**
 * A rep's payout statement — the document GV hands a closer/setter showing what
 * they're owed: deals, commission, base, bonus, and a manager's skim, summing to
 * the total. Pure and money-safe: every figure is taken straight from the tested
 * commission rollup (RepOwedLine), never recomputed here, so the statement and
 * the Commissions table can never disagree.
 *
 * The rollup is cumulative (all closed deals to date), so the statement is a
 * "commissions owed to date" document, not a single calendar month.
 */

export interface RepPayoutStatement {
  repId: string;
  repName: string;
  teamName: string;
  role: string;
  dealCount: number;
  commissionCents: number;
  baseCents: number;
  bonusCents: number;
  /** Manager top-line skim; zero for everyone else. */
  skimCents: number;
  /** commission + base + bonus + skim — the number that gets paid. */
  totalOwedCents: number;
  /** Whether this rep has been marked paid for the current payout period. */
  paid: boolean;
}

export function buildRepPayoutStatement(
  line: RepOwedLine,
  ctx: { repName: string; teamName: string; paid: boolean },
): RepPayoutStatement {
  return {
    repId: line.repId,
    repName: ctx.repName,
    teamName: ctx.teamName,
    role: line.role,
    dealCount: line.run.dealCount,
    commissionCents: line.run.commissionCents,
    baseCents: line.run.baseCents,
    bonusCents: line.run.bonusCents,
    skimCents: line.skimCents,
    totalOwedCents: line.totalOwedCents,
    paid: ctx.paid,
  };
}
