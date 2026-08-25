/**
 * The Money Spine reconciler (MONEY-SPINE-SPEC §4) — the "can't fail" conscience.
 *
 * For each offer + month it proves three numbers agree:
 *   sources cash  ==  client-ledger cash  ==  (rev-share basis + fees)
 *
 * When they don't, it says by exactly how much and why. Pure and total, so the
 * check itself can never throw on a money path; the DB gather lives in the
 * matching *-query.ts.
 */

export interface OfferMonthInput {
  slug: string;
  name: string;
  month: string; // yyyy-mm
  /** Resolved authority for this offer (see lib/sources/cash-authority). */
  authority: "forms" | "processors";
  /** Whether any processor source is connected for this offer. */
  hasProcessor: boolean;
  /** Client-layer cash in the ledger for this offer+month. */
  ledgerCashCents: number;
  /** Processor fees carried in the ledger for this offer+month. */
  ledgerFeeCents: number;
  /** Cash-after-fees the rev-share engine rated; null when no rule applies. */
  revshareBasisCents: number | null;
  /** Captured + posted processor charges (net of refunds) for this offer+month. */
  processorCapturedCents: number;
}

export interface ReconcileRow extends OfferMonthInput {
  /** The authoritative source total: processors → captured, forms → ledger. */
  sourceCashCents: number;
  /** sourceCash − ledgerCash. Non-zero = money captured but not in the books. */
  cashDeltaCents: number;
  /** (ledgerCash − fees) − revshareBasis; null when no rule. Non-zero = mis-rated. */
  basisDeltaCents: number | null;
  status: "ok" | "drift" | "config";
  issues: string[];
}

export interface ReconcileReport {
  rows: ReconcileRow[];
  driftCount: number;
  configCount: number;
  allGreen: boolean;
  /** Absolute total of every cash delta — the headline "off by" figure. */
  totalCashDriftCents: number;
}

function reconcileOne(i: OfferMonthInput): ReconcileRow {
  const sourceCashCents =
    i.authority === "processors" ? i.processorCapturedCents : i.ledgerCashCents;
  const cashDeltaCents = sourceCashCents - i.ledgerCashCents;
  const basisDeltaCents =
    i.revshareBasisCents === null
      ? null
      : i.ledgerCashCents - i.ledgerFeeCents - i.revshareBasisCents;

  const issues: string[] = [];
  if (cashDeltaCents !== 0) {
    const captured = cashDeltaCents > 0;
    issues.push(
      captured
        ? `${money(cashDeltaCents)} captured from processors but not yet in the ledger`
        : `${money(-cashDeltaCents)} in the ledger with no matching processor capture`,
    );
  }
  if (basisDeltaCents !== null && basisDeltaCents !== 0) {
    issues.push(`Rev-share basis off by ${money(basisDeltaCents)}`);
  }
  if (i.authority === "forms" && i.hasProcessor) {
    issues.push(
      "A processor is connected but the form is the cash authority — flip to auto/processors so the processor owns the cash",
    );
  }

  const hasDrift =
    cashDeltaCents !== 0 || (basisDeltaCents !== null && basisDeltaCents !== 0);
  const status: ReconcileRow["status"] = hasDrift
    ? "drift"
    : issues.length > 0
      ? "config"
      : "ok";

  return {
    ...i,
    sourceCashCents,
    cashDeltaCents,
    basisDeltaCents,
    status,
    issues,
  };
}

export function reconcileSpine(inputs: OfferMonthInput[]): ReconcileReport {
  const rows = inputs
    .map(reconcileOne)
    // Worst first: drift, then config, then ok — newest month within each.
    .sort((a, b) => rank(b) - rank(a) || (a.month < b.month ? 1 : -1));
  const driftCount = rows.filter((r) => r.status === "drift").length;
  const configCount = rows.filter((r) => r.status === "config").length;
  return {
    rows,
    driftCount,
    configCount,
    allGreen: driftCount === 0,
    totalCashDriftCents: rows.reduce((s, r) => s + Math.abs(r.cashDeltaCents), 0),
  };
}

function rank(r: ReconcileRow): number {
  return r.status === "drift" ? 2 : r.status === "config" ? 1 : 0;
}

function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
