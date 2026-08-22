/**
 * Agency ledger rollups — pure, money-critical, 100% covered. Everything
 * here is a fold over backlog rows; nothing is stored. The breakdown chain
 * (spec §4): total cash → after processor fees → after team → net.
 *
 * "Team" out-rows are payouts to people who work the offers (rep share,
 * retainers); other out-rows (expenses, ad spend) land between team and
 * net. Partner distribution is NOT part of the chain — the 50/50 splits
 * net, in the payout area only.
 */

export interface LedgerInputRow {
  direction: string;
  layer: string;
  dealType: string | null;
  paymentMethod: string | null;
  revenueCents: number;
  cashCents: number;
  processorFeeCents: number;
}

/** Out-row deal types that count as "team" in the chain. */
export const TEAM_OUT_TYPES = ["Rep Share", "Retainer", "Team Payout"] as const;

export interface BreakdownChain {
  totalCashCents: number;
  processorFeeCents: number;
  afterFeesCents: number;
  teamCents: number;
  afterTeamCents: number;
  otherOutCents: number;
  netCents: number;
}

export interface GroupLine {
  key: string;
  count: number;
  revenueCents: number;
  cashCents: number;
  processorFeeCents: number;
}

export interface AgencyLedger {
  chain: BreakdownChain;
  byDealType: GroupLine[];
  byMethod: GroupLine[];
}

function groupBy(
  rows: LedgerInputRow[],
  key: (r: LedgerInputRow) => string,
): GroupLine[] {
  const groups = new Map<string, GroupLine>();
  for (const r of rows) {
    const k = key(r);
    const line = groups.get(k) ?? {
      key: k,
      count: 0,
      revenueCents: 0,
      cashCents: 0,
      processorFeeCents: 0,
    };
    line.count += 1;
    line.revenueCents += r.revenueCents;
    line.cashCents += r.cashCents;
    line.processorFeeCents += r.processorFeeCents;
    groups.set(k, line);
  }
  return [...groups.values()].sort((a, b) => b.cashCents - a.cashCents);
}

export function agencyLedger(rows: LedgerInputRow[]): AgencyLedger {
  const agency = rows.filter((r) => r.layer === "agency");
  const inRows = agency.filter((r) => r.direction === "in");
  const outRows = agency.filter((r) => r.direction === "out");

  const totalCashCents = inRows.reduce((s, r) => s + r.cashCents, 0);
  const processorFeeCents = inRows.reduce((s, r) => s + r.processorFeeCents, 0);
  const teamCents = outRows
    .filter((r) => (TEAM_OUT_TYPES as readonly string[]).includes(r.dealType ?? ""))
    .reduce((s, r) => s + r.cashCents, 0);
  const otherOutCents = outRows
    .filter((r) => !(TEAM_OUT_TYPES as readonly string[]).includes(r.dealType ?? ""))
    .reduce((s, r) => s + r.cashCents, 0);

  const afterFeesCents = totalCashCents - processorFeeCents;
  const afterTeamCents = afterFeesCents - teamCents;
  const netCents = afterTeamCents - otherOutCents;

  return {
    chain: {
      totalCashCents,
      processorFeeCents,
      afterFeesCents,
      teamCents,
      afterTeamCents,
      otherOutCents,
      netCents,
    },
    byDealType: groupBy(inRows, (r) => r.dealType?.trim() || "Uncategorized"),
    byMethod: groupBy(inRows, (r) => r.paymentMethod?.trim() || "Unknown"),
  };
}
