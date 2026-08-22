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

/**
 * Client/offer ledger: revenue + cash per client, from the same backlog.
 * Attribution is derived at READ time — a row belongs to a client if its
 * client_id joined (processor rows) or its description matches the client's
 * sheet aliases (sheet rows; the table is append-only, so attribution is
 * computed, never stored). Rows matching nothing land in "Unattributed" —
 * visible, never silently dropped.
 */

export interface ClientLedgerInputRow extends LedgerInputRow {
  clientName: string | null;
  description: string | null;
}

export interface ClientLedgerLine {
  slug: string | null;
  name: string;
  count: number;
  revenueCents: number;
  cashCents: number;
  processorFeeCents: number;
  afterFeesCents: number;
}

export function clientLedger(
  rows: ClientLedgerInputRow[],
  roster: { slug: string; name: string }[],
  matches: (slug: string, sheetClient: string) => boolean,
): ClientLedgerLine[] {
  const lines = new Map<string, ClientLedgerLine>();
  const lineFor = (slug: string | null, name: string): ClientLedgerLine => {
    // Slug-less lines key by name so an off-roster joined client never
    // merges into the Unattributed bucket.
    const key = slug ?? `name:${name}`;
    const existing = lines.get(key);
    if (existing) return existing;
    const fresh: ClientLedgerLine = {
      slug,
      name,
      count: 0,
      revenueCents: 0,
      cashCents: 0,
      processorFeeCents: 0,
      afterFeesCents: 0,
    };
    lines.set(key, fresh);
    return fresh;
  };

  for (const r of rows.filter((x) => x.direction === "in")) {
    let target: ClientLedgerLine | null = null;
    if (r.clientName) {
      const known = roster.find((c) => c.name === r.clientName);
      target = lineFor(known?.slug ?? null, r.clientName);
    } else if (r.description) {
      const matched = roster.find((c) => matches(c.slug, r.description as string));
      if (matched) target = lineFor(matched.slug, matched.name);
    }
    if (!target) target = lineFor(null, "Unattributed");
    target.count += 1;
    target.revenueCents += r.revenueCents;
    target.cashCents += r.cashCents;
    target.processorFeeCents += r.processorFeeCents;
    target.afterFeesCents += r.cashCents - r.processorFeeCents;
  }
  return [...lines.values()].sort((a, b) => b.cashCents - a.cashCents);
}
