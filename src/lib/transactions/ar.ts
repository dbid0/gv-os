/**
 * Accounts receivable + the money calendar (v2 §4) — pure, 100% covered.
 *
 * Two kinds of money owed:
 *  - partial deals: an income row whose revenue exceeds its cash — the
 *    difference is still due;
 *  - rev-share owed: computed pending lines minus what clients already
 *    paid (revshare_received payouts marked paid), floored at zero.
 *
 * The calendar lays owed-in and planned-out on one monthly timeline.
 */

export interface ArBacklogRow {
  direction: string;
  layer: string;
  occurredOn: string;
  description: string | null;
  clientName: string | null;
  dealType: string | null;
  revenueCents: number;
  cashCents: number;
}

export interface ArItem {
  kind: "partial" | "revshare";
  label: string;
  /** yyyy-mm the receivable belongs to. */
  month: string;
  /** yyyy-mm-dd it arose (for aging); null for computed rev-share. */
  aroseOn: string | null;
  arCents: number;
}

/** Partial deals: revenue booked above cash collected, per income row. */
export function partialDealAr(rows: ArBacklogRow[]): ArItem[] {
  return rows
    .filter((r) => r.direction === "in" && r.revenueCents > r.cashCents)
    .map((r) => ({
      kind: "partial" as const,
      label: r.clientName ?? r.description ?? "Unlabeled deal",
      month: r.occurredOn.slice(0, 7),
      aroseOn: r.occurredOn,
      arCents: r.revenueCents - r.cashCents,
    }))
    .sort((a, b) => b.arCents - a.arCents);
}

export interface RevShareOwedInput {
  clientId: string;
  clientName: string;
  month: string;
  revShareCents: number;
}

export interface RevShareReceived {
  clientId: string | null;
  cashCents: number;
}

/** Pending rev-share minus what that client already paid, floored at zero. */
export function revShareOwed(
  lines: RevShareOwedInput[],
  received: RevShareReceived[],
): ArItem[] {
  const paidByClient = new Map<string, number>();
  for (const r of received) {
    if (!r.clientId) continue;
    paidByClient.set(r.clientId, (paidByClient.get(r.clientId) ?? 0) + r.cashCents);
  }
  const items: ArItem[] = [];
  // Oldest month first so payments retire the oldest balance.
  const ordered = [...lines].sort((a, b) => (a.month < b.month ? -1 : 1));
  for (const line of ordered) {
    const credit = paidByClient.get(line.clientId) ?? 0;
    const applied = Math.min(credit, line.revShareCents);
    paidByClient.set(line.clientId, credit - applied);
    const owed = line.revShareCents - applied;
    if (owed > 0) {
      items.push({
        kind: "revshare",
        label: `${line.clientName} — rev-share ${line.month}`,
        month: line.month,
        aroseOn: null,
        arCents: owed,
      });
    }
  }
  return items.sort((a, b) => b.arCents - a.arCents);
}

export interface CalendarMonth {
  month: string;
  owedInCents: number;
  plannedOutCents: number;
}

/** One monthly timeline: what should arrive vs what is planned to leave. */
export function moneyCalendar(
  arItems: ArItem[],
  pendingPayouts: { month: string; totalCents: number; kind: string }[],
): CalendarMonth[] {
  const months = new Map<string, CalendarMonth>();
  const bucket = (month: string): CalendarMonth => {
    const existing = months.get(month);
    if (existing) return existing;
    const fresh = { month, owedInCents: 0, plannedOutCents: 0 };
    months.set(month, fresh);
    return fresh;
  };
  for (const item of arItems) bucket(item.month).owedInCents += item.arCents;
  for (const p of pendingPayouts) {
    if (p.kind === "revshare_received") bucket(p.month).owedInCents += p.totalCents;
    else bucket(p.month).plannedOutCents += p.totalCents;
  }
  return [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}
