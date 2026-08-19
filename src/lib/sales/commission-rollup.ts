/**
 * Commission rollups: from one period's deals and the splits on them, what each
 * rep is owed, and the payout run to pay them.
 *
 * This is the layer RepVision's Commissions table sits on. Two rules carry over
 * from the accounting side and are the whole point of doing it here rather than
 * in a spreadsheet:
 *
 *   1. A rep's commission is the SUM of per-deal commissions (each rounded to a
 *      real cent), never a percentage of a summed basis — so the line items and
 *      the total a rep is paid can never disagree.
 *   2. The dollar figures are DERIVED from the collected cash we pass in, not
 *      stored. Change what was collected and the owed number changes with it;
 *      there is no second copy to drift.
 *
 * It is deliberately pure — plain inputs, no database — so it is testable to the
 * cent. A thin adapter maps deal/commission_split rows onto these inputs.
 */

import { type Cents, ZERO, add, sum } from "@/lib/money";
import { type Bps } from "@/lib/splits";
import {
  type CommissionBasis,
  type CommissionRun,
  type DealAmounts,
  type RunDeal,
  commissionRun,
  topLineSkim,
} from "@/lib/sales/commission";

/** A participant on one deal: their role and rate, plus any one-off bonus. */
export interface SplitInput {
  repId: string;
  role: string;
  rateBps: Bps;
  bonusCents?: Cents;
  /**
   * Where the split came from. "explicit" is a real split row; "default" is one
   * synthesized from the team's default rate because the deal had no explicit
   * split. A default split still pays, but the deal is still flagged as missing
   * an explicit split — the way RepVision both pays the default and warns.
   */
  source?: "explicit" | "default";
}

/** A deal in the period, with its collected amounts and the splits on it. */
export interface DealWithSplits {
  deal: DealAmounts;
  splits: readonly SplitInput[];
}

/** A rep's standing comp, applied on top of their per-deal commission. */
export interface RepComp {
  repId: string;
  role: string;
  /** A fixed base owed for the period, regardless of deals. */
  basePayCents?: Cents;
  /** Manager only: a skim across the whole team's total, in basis points. */
  topLineSkimBps?: Bps;
}

/** What one rep is owed for the period. */
export interface RepOwedLine {
  repId: string;
  role: string;
  /** Per-deal commission + base + bonus. */
  run: CommissionRun;
  /** A manager's top-line skim; zero for everyone else. */
  skimCents: Cents;
  /** run.totalOwedCents + skimCents — the number that gets paid. */
  totalOwedCents: Cents;
}

/** The whole team's owed position for the period. */
export interface CommissionRollup {
  reps: RepOwedLine[];
  teamCashCents: Cents;
  teamRevenueCents: Cents;
  /** Closed deals carrying no split — money that would go uncommissioned. */
  dealsMissingSplits: number;
  totalOwedCents: Cents;
}

/** What a rep accumulates across the period before their line is computed. */
interface Accrual {
  role: string;
  runDeals: RunDeal[];
  bonusCents: Cents;
  baseCents: Cents;
  skimBps: Bps;
}

/**
 * Rolls a period's deals + splits into a per-rep owed run.
 *
 * Every rep with a comp OR a split gets a line: a manager with a skim and no
 * closes still needs paying, and a rep who closed without a comp row on file
 * still earned their split. Deals with no split are counted, not silently
 * dropped — uncommissioned closed deals are a mistake worth surfacing.
 */
export function rollupCommissions(
  deals: readonly DealWithSplits[],
  repComps: readonly RepComp[],
  basis: CommissionBasis,
): CommissionRollup {
  const teamTotals: DealAmounts = {
    cashCollectedCents: sum(deals.map((d) => d.deal.cashCollectedCents)),
    revenueCents: sum(deals.map((d) => d.deal.revenueCents)),
  };

  // Seed from comps first, so a rep's role, base, and skim come from their
  // record and the output orders comped reps ahead of split-only stragglers.
  const accruals = new Map<string, Accrual>();
  for (const c of repComps) {
    accruals.set(c.repId, {
      role: c.role,
      runDeals: [],
      bonusCents: ZERO,
      baseCents: c.basePayCents ?? ZERO,
      skimBps: c.topLineSkimBps ?? 0,
    });
  }

  let dealsMissingSplits = 0;
  for (const { deal, splits } of deals) {
    // Flagged when there is no EXPLICIT split — whether the deal is bare or only
    // carries a team-default split. A default split still pays (it accrues
    // below); the flag is the "N deals missing commission splits" warning.
    const hasExplicit = splits.some((s) => (s.source ?? "explicit") === "explicit");
    if (!hasExplicit) dealsMissingSplits += 1;
    for (const s of splits) {
      let acc = accruals.get(s.repId);
      if (!acc) {
        acc = {
          role: s.role,
          runDeals: [],
          bonusCents: ZERO,
          baseCents: ZERO,
          skimBps: 0,
        };
        accruals.set(s.repId, acc);
      }
      acc.runDeals.push({ deal, rateBps: s.rateBps });
      if (s.bonusCents !== undefined) {
        acc.bonusCents = add(acc.bonusCents, s.bonusCents);
      }
    }
  }

  const reps: RepOwedLine[] = [];
  for (const [repId, acc] of accruals) {
    const run = commissionRun(acc.runDeals, basis, {
      baseCents: acc.baseCents,
      bonusCents: acc.bonusCents,
    });
    const skimCents = topLineSkim(teamTotals, acc.skimBps, basis);
    reps.push({
      repId,
      role: acc.role,
      run,
      skimCents,
      totalOwedCents: add(run.totalOwedCents, skimCents),
    });
  }

  return {
    reps,
    teamCashCents: teamTotals.cashCollectedCents,
    teamRevenueCents: teamTotals.revenueCents,
    dealsMissingSplits,
    totalOwedCents: sum(reps.map((r) => r.totalOwedCents)),
  };
}

/** A rep's pay line in a payout run, with whether it has been paid. */
export interface PayoutLine {
  repId: string;
  owedCents: Cents;
  paid: boolean;
}

/** A mark-paid run over a rollup: who is owed, what is paid, what remains. */
export interface PayoutChecklist {
  lines: PayoutLine[];
  paidCents: Cents;
  unpaidCents: Cents;
  allPaid: boolean;
}

/**
 * Turns a rollup into a mark-paid checklist. `paidRepIds` are the reps already
 * paid in this run. Nothing here moves money — it reports what is left to pay,
 * so the actual payout is recorded as ledger events elsewhere.
 */
export function payoutChecklist(
  rollup: CommissionRollup,
  paidRepIds: ReadonlySet<string> = new Set(),
): PayoutChecklist {
  const lines: PayoutLine[] = rollup.reps.map((r) => ({
    repId: r.repId,
    owedCents: r.totalOwedCents,
    paid: paidRepIds.has(r.repId),
  }));
  return {
    lines,
    paidCents: sum(lines.filter((l) => l.paid).map((l) => l.owedCents)),
    unpaidCents: sum(lines.filter((l) => !l.paid).map((l) => l.owedCents)),
    allPaid: lines.every((l) => l.paid),
  };
}
