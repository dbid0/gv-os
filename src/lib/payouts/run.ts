import { partnerSplitCents } from "@/lib/payouts/math";

/**
 * Assembling a month's payout run — pure, so which rows get created is testable
 * without a database. Two assemblers, each adding one kind of money row
 * DELIBERATELY and idempotently:
 *
 *  - `assembleRevShareRun` turns each client's computed rev-share into a
 *    `revshare_received` receivable (money IN to GV).
 *  - `assemblePartnerSplit` turns GV's undistributed net into the two 50/50
 *    `partner` distributions (money OUT to Daniel + Gus), penny-exact.
 *
 * Both skip work already present on the month's run, so re-generating never
 * doubles a row. Rep commissions are deliberately NOT disbursed here — they are
 * paid on the Commissions tab (a separate ledger); the payouts page shows what
 * is owed as read-only context so the run reads as the whole picture.
 */

export interface RevShareOwedInput {
  clientId: string;
  clientName: string;
  revShareCents: number;
}

export interface PayoutDraft {
  month: string;
  kind: "revshare_received" | "partner";
  label: string;
  clientId: string | null;
  baseCents: number;
}

export function assembleRevShareRun(
  month: string,
  owed: RevShareOwedInput[],
  existingClientIds: ReadonlySet<string>,
): PayoutDraft[] {
  return owed
    .filter((o) => o.revShareCents > 0 && !existingClientIds.has(o.clientId))
    .map((o) => ({
      month,
      kind: "revshare_received" as const,
      label: `${o.clientName} — rev-share`,
      clientId: o.clientId,
      baseCents: o.revShareCents,
    }));
}

/**
 * The 50/50 partner distribution of GV's undistributed net. Creates the two
 * `partner` rows (Daniel, Gus) only when there is positive net to split AND the
 * month has no partner rows yet — so re-running never re-splits. Penny-exact via
 * the proven allocator, so the two halves always sum to the net.
 */
export function assemblePartnerSplit(
  month: string,
  netCents: number,
  monthHasPartnerRows: boolean,
): PayoutDraft[] {
  if (monthHasPartnerRows || netCents <= 0) return [];
  const { danielCents, gusCents } = partnerSplitCents(netCents);
  return [
    {
      month,
      kind: "partner" as const,
      label: "Daniel — partner distribution (50%)",
      clientId: null,
      baseCents: danielCents,
    },
    {
      month,
      kind: "partner" as const,
      label: "Gus — partner distribution (50%)",
      clientId: null,
      baseCents: gusCents,
    },
  ];
}
