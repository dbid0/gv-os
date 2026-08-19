/**
 * From database rows to a commission rollup.
 *
 * `commission-rollup.ts` is pure and speaks in plain shapes so it can be tested
 * to the cent. This adapter is the thin, boring layer that turns the real
 * `deal`, `commission_split`, and `rep` rows into those shapes and hands them
 * over. It is the ONLY place that knows about the schema, so the money math
 * never depends on how the tables happen to be shaped.
 *
 * One deliberate seam: cash collected is NOT read from a deal column — it comes
 * from the ledger, computed by the accounting side. So the caller passes a
 * `cashByDeal` lookup, and this file never imports the accounting adapter. The
 * two halves meet at the call site, not in a hidden dependency. Revenue, by
 * contrast, is what was AGREED, which is a fact on the deal row itself.
 */

import { type Cents, ZERO, cents } from "@/lib/money";
import { type Bps } from "@/lib/splits";
import { type CommissionBasis } from "@/lib/sales/commission";
import {
  type CommissionRollup,
  type DealWithSplits,
  type RepComp,
  rollupCommissions,
} from "@/lib/sales/commission-rollup";
import type { CommissionSplit, Deal, Rep } from "@/db/schema/app";

/** Cash collected per deal id, in cents — sourced from the ledger, not a column. */
export type CashByDeal = ReadonlyMap<string, Cents>;

/**
 * A team's default closer commission rate, in bps, keyed by team (client) id.
 *
 * When a deal has no explicit split, RepVision still pays the closer at the
 * team's default rate and flags the deal as missing a split. We mirror that:
 * this map lets the adapter synthesize a default split for the closing rep.
 */
export type TeamDefaultCloserBps = ReadonlyMap<string, Bps>;

/**
 * Maps rows onto the rollup's inputs.
 *
 * Splits are attached to the deal they name; a split whose deal is not in this
 * set is out of the period and simply left out. A deal's revenue is its agreed
 * contract value; its cash is whatever the ledger says was collected, or zero.
 *
 * A deal with NO explicit split falls back to the team's default closer rate
 * applied to its closing rep (`deal.repId`) — a "default" split that still pays
 * but keeps the deal flagged as missing an explicit split. Falls back only when
 * both the closing rep and a team default exist.
 */
export function buildRollupInputs(
  deals: readonly Deal[],
  splits: readonly CommissionSplit[],
  reps: readonly Rep[],
  cashByDeal: CashByDeal,
  teamDefaultCloserBps: TeamDefaultCloserBps = new Map(),
): { deals: DealWithSplits[]; comps: RepComp[] } {
  const splitsByDeal = new Map<string, CommissionSplit[]>();
  for (const split of splits) {
    const list = splitsByDeal.get(split.dealId);
    if (list) {
      list.push(split);
    } else {
      splitsByDeal.set(split.dealId, [split]);
    }
  }

  const dealsWithSplits: DealWithSplits[] = deals.map((deal) => {
    const explicit = (splitsByDeal.get(deal.id) ?? []).map((split) => ({
      repId: split.repId,
      role: split.role,
      rateBps: split.rateBps as Bps,
      source: "explicit" as const,
      ...(split.bonusCents !== null ? { bonusCents: cents(split.bonusCents) } : {}),
    }));

    const defaultBps = teamDefaultCloserBps.get(deal.clientId);
    const splitsForDeal =
      explicit.length === 0 && deal.repId !== null && defaultBps !== undefined
        ? [
            {
              repId: deal.repId,
              role: "closer",
              rateBps: defaultBps,
              source: "default" as const,
            },
          ]
        : explicit;

    return {
      deal: {
        cashCollectedCents: cashByDeal.get(deal.id) ?? ZERO,
        revenueCents: cents(deal.contractValueCents),
      },
      splits: splitsForDeal,
    };
  });

  const comps: RepComp[] = reps.map((rep) => ({
    repId: rep.id,
    role: rep.role,
    ...(rep.basePayCents !== null ? { basePayCents: cents(rep.basePayCents) } : {}),
    ...(rep.topLineSkimBps !== null
      ? { topLineSkimBps: rep.topLineSkimBps as Bps }
      : {}),
  }));

  return { deals: dealsWithSplits, comps };
}

/**
 * The one-call path: rows in, a finished rollup out. `basis` is the run-level
 * Cash-vs-Revenue toggle RepVision puts above the Commissions table; the
 * per-split `basis` column is its stored default, applied when a split is
 * created, not here.
 */
export function rollupFromRows(
  deals: readonly Deal[],
  splits: readonly CommissionSplit[],
  reps: readonly Rep[],
  cashByDeal: CashByDeal,
  basis: CommissionBasis,
  teamDefaultCloserBps: TeamDefaultCloserBps = new Map(),
): CommissionRollup {
  const inputs = buildRollupInputs(
    deals,
    splits,
    reps,
    cashByDeal,
    teamDefaultCloserBps,
  );
  return rollupCommissions(inputs.deals, inputs.comps, basis);
}
