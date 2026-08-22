import { cents, type Cents } from "@/lib/money";
import { allocatePair } from "@/lib/splits";

/**
 * Payout math (v2 §4) — pure, money-critical, 100% covered. A payout's
 * total is its base plus every line-item adjustment; the partner split is
 * penny-exact via the proven allocator (50/50 default, per-case override).
 */

export const PAYOUT_KINDS = [
  "partner",
  "rep_share",
  "retainer",
  "processor",
  "ad_spend",
  "revshare_received",
  "other",
] as const;
export type PayoutKind = (typeof PAYOUT_KINDS)[number];

/** Money coming TO GV (a client paying their rev-share) vs leaving it. */
export function payoutDirection(kind: string): "in" | "out" {
  return kind === "revshare_received" ? "in" : "out";
}

/** The backlog deal-type label a paid payout is recorded under. */
export function payoutDealType(kind: string): string {
  switch (kind) {
    case "partner":
      return "Partner Distribution";
    case "rep_share":
      return "Rep Share";
    case "retainer":
      return "Retainer";
    case "processor":
      return "Processor Fees";
    case "ad_spend":
      return "Ad Spend";
    case "revshare_received":
      return "Rev-Share";
    default:
      return "Other";
  }
}

export function payoutTotalCents(
  baseCents: number,
  adjustments: { deltaCents: number }[],
): number {
  return adjustments.reduce((sum, a) => sum + a.deltaCents, baseCents);
}

/** 50/50 by default; override in whole basis points for special cases. */
export function partnerSplitCents(
  netCents: number,
  danielBps = 5000,
): { danielCents: Cents; gusCents: Cents } {
  const { first, second } = allocatePair(cents(netCents), danielBps);
  return { danielCents: first, gusCents: second };
}
