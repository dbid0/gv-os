/**
 * The agency-book reconciler (MONEY-SPINE-SPEC step 3) — the same "can't fail"
 * proof, turned on GV's OWN money: setup fees, rev-share GV collects, and
 * consulting income (layer=agency).
 *
 * Agency income is largely entered directly (wire / manual / rev-share GV
 * bills), which is self-sourced — the ledger row IS the source. Where a
 * processor is wired for the agency (e.g. Stripe for setup fees), a capture
 * that hasn't been posted to the book yet is DRIFT: money arrived, not yet
 * recorded. Pure and total, so the check never throws on a money path.
 */

export interface AgencyMonthInput {
  month: string; // yyyy-mm
  /** Agency-layer cash in the ledger for the month. */
  ledgerCashCents: number;
  /** Agency processor charges captured + posted (net of refunds). */
  capturedCents: number;
  /** Agency processor charges captured but NOT yet posted to the book. */
  pendingCaptureCents: number;
}

export interface AgencyReconcileRow extends AgencyMonthInput {
  /** Captured-but-unposted agency processor cash — the drift figure. */
  driftCents: number;
  status: "ok" | "drift";
  issues: string[];
}

export interface AgencyReconcileReport {
  rows: AgencyReconcileRow[];
  driftCount: number;
  allGreen: boolean;
  /** All agency-layer cash in the book across the range. */
  ledgerTotalCents: number;
  totalDriftCents: number;
}

function reconcileOne(i: AgencyMonthInput): AgencyReconcileRow {
  const driftCents = i.pendingCaptureCents;
  const issues: string[] = [];
  if (driftCents !== 0) {
    issues.push(
      `${money(driftCents)} captured to the agency account but not yet in the book`,
    );
  }
  return { ...i, driftCents, status: driftCents !== 0 ? "drift" : "ok", issues };
}

export function reconcileAgency(inputs: AgencyMonthInput[]): AgencyReconcileReport {
  const rows = inputs
    .map(reconcileOne)
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
  const driftCount = rows.filter((r) => r.status === "drift").length;
  return {
    rows,
    driftCount,
    allGreen: driftCount === 0,
    ledgerTotalCents: rows.reduce((s, r) => s + r.ledgerCashCents, 0),
    totalDriftCents: rows.reduce((s, r) => s + Math.abs(r.driftCents), 0),
  };
}

function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
