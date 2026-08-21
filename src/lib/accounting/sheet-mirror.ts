/**
 * The Master Finance Sheet mirror engine — Accounting Phase A.
 *
 * The sheet stays the system of record. This module re-implements, in integer
 * cents, the EXACT computation chain the sheet's `💰 New Deals` tab runs over
 * `Raw Data`, so GV OS can recompute every deal and report any disagreement
 * with the sheet's own figures to the cent. Zero drift is the pass.
 *
 * The chain, transcribed from the live ARRAYFORMULAs (read 2026-08-21):
 *
 *   AR      = max(revenue − cash, 0)
 *   fee     = raw override if present
 *             else cash × rate(method) + (method = "Fanbasis" && cash > 0 ? $0.29 : 0)
 *   net     = cash − fee
 *   pct     = 50% if deal type = "Client Handoff", 50% if blank, else entered% ÷ 100
 *   daniel  = net × pct
 *   gus     = net − daniel          ← residual, so the pair always sums to net
 *
 * The sheet computes in floats and stores sub-cent values (a 50/50 split of
 * $1,941.71 is 970.855 / 970.855 — unpayable as-is). We compute in integer
 * cents with half-away-from-zero rounding and take Gus as the residual, so our
 * pair is always payable and always sums exactly to net. The drift report is
 * where those two worlds are compared, honestly, per figure.
 *
 * Pure module: no I/O, no Date.now, fully unit-tested under the 100% gate.
 */

/** Basis-point rate per payment method, straight from the sheet formula. */
export const SHEET_FEE_RATES_BPS: Record<string, number> = {
  Wire: 0,
  ACH: 0,
  Zelle: 0,
  Wise: 0,
  "Check / Cash": 0,
  Fanbasis: 290,
  Stripe: 290,
  "Shopify Affirm": 290,
  Card: 290,
  Amex: 290,
  Whop: 451,
  PayPal: 349,
  Venmo: 190,
  "Cash App": 275,
  Crypto: 150,
  Payva: 800,
};

/** The formula's catch-all for a method it doesn't list. */
export const SHEET_FEE_FALLBACK_BPS = 300;

/** Fanbasis adds a flat $0.29 per transaction when any cash moved. */
export const FANBASIS_FLAT_CENTS = 29;

const DANIEL_DEFAULT_BPS = 5000;

/** Round half away from zero — matches the money lib and sheet display. */
function roundHalfAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * A dollar amount as it arrives from the Sheets API (an unformatted float,
 * possibly with binary noise like 2082.9970000000003) → integer cents.
 */
export function centsFromSheetNumber(
  value: number | string | null | undefined,
): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Not a finite dollar amount from the sheet: ${String(value)}`);
  }
  return roundHalfAway(n * 100);
}

/** One deal's INPUTS, as entered in `Raw Data` (cols A–M). */
export interface MirrorDealInput {
  rowIndex: number;
  timestamp: string;
  dateClosed: string;
  client: string;
  dealType: string;
  offer: string;
  revenueCents: number;
  cashCents: number;
  method: string;
  /** Daniel's % as entered (30, 40, 45, 50…). Null = blank. */
  pctEntered: number | null;
  /** Per-deal fee override in cents. Null = blank (formula applies). */
  feeOverrideCents: number | null;
  agreement: string;
  notes: string;
  payoutStatus: string;
}

/** The five derived figures, in cents. */
export interface MirrorComputed {
  arCents: number;
  feeCents: number;
  netCents: number;
  danielCents: number;
  gusCents: number;
}

/** Processor fee exactly as the sheet formula computes it, in cents. */
export function sheetFeeCents(
  cashCents: number,
  method: string,
  feeOverrideCents: number | null,
): number {
  if (feeOverrideCents !== null) return feeOverrideCents;
  const bps = SHEET_FEE_RATES_BPS[method] ?? SHEET_FEE_FALLBACK_BPS;
  const pctFee = roundHalfAway((cashCents * bps) / 10_000);
  const flat = method === "Fanbasis" && cashCents > 0 ? FANBASIS_FLAT_CENTS : 0;
  return pctFee + flat;
}

/** Daniel's share in basis points, per the sheet's precedence rules. */
export function danielPctBps(dealType: string, pctEntered: number | null): number {
  if (dealType === "Client Handoff") return DANIEL_DEFAULT_BPS;
  if (pctEntered === null) return DANIEL_DEFAULT_BPS;
  return roundHalfAway(pctEntered * 100);
}

/** Run the full chain for one deal, in integer cents. */
export function computeDeal(input: MirrorDealInput): MirrorComputed {
  const arCents = Math.max(input.revenueCents - input.cashCents, 0);
  const feeCents = sheetFeeCents(input.cashCents, input.method, input.feeOverrideCents);
  const netCents = input.cashCents - feeCents;
  const bps = danielPctBps(input.dealType, input.pctEntered);
  const danielCents = roundHalfAway((netCents * bps) / 10_000);
  const gusCents = netCents - danielCents;
  return { arCents, feeCents, netCents, danielCents, gusCents };
}

/**
 * Normalize either sheet date format ("2026-05-23" or "7/1/2026 16:06:48")
 * to an ISO yyyy-mm-dd date string. Unparseable input comes back as-is so a
 * weird row is visible rather than silently dropped.
 */
export function isoDate(raw: string): string {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return s;
}

/** A cell that may be a number, string, or absent. */
type Cell = string | number | null | undefined;

const str = (c: Cell): string =>
  c === null || c === undefined ? "" : String(c).trim();

/**
 * Parse one `Raw Data` row (A–M, header row excluded). Returns null for a row
 * with no client and no cash — the sheet pads with empties.
 */
export function parseRawRow(row: Cell[], rowIndex: number): MirrorDealInput | null {
  const client = str(row[2]);
  const cash = str(row[6]);
  if (client === "" && cash === "") return null;
  const pctRaw = str(row[8]);
  const feeRaw = str(row[9]);
  return {
    rowIndex,
    timestamp: str(row[0]),
    dateClosed: isoDate(str(row[1])),
    client,
    dealType: str(row[3]),
    offer: str(row[4]),
    revenueCents: centsFromSheetNumber(row[5] === "" ? 0 : (row[5] ?? 0)),
    cashCents: centsFromSheetNumber(row[6] === "" ? 0 : (row[6] ?? 0)),
    method: str(row[7]),
    pctEntered: pctRaw === "" ? null : Number(pctRaw),
    feeOverrideCents: feeRaw === "" ? null : centsFromSheetNumber(row[9]),
    agreement: str(row[10]),
    notes: str(row[11]),
    payoutStatus: str(row[12]),
  };
}

/**
 * Parse the sheet's OWN computed figures for one `💰 New Deals` row (A–Q),
 * rounded to cents. Column order per the live header:
 * H=AR · J=fee · K=net · M=daniel · N=gus.
 */
export function parseSheetComputedRow(row: Cell[]): MirrorComputed {
  const num = (c: Cell): number => centsFromSheetNumber(c === "" ? 0 : (c ?? 0));
  return {
    arCents: num(row[7]),
    feeCents: num(row[9]),
    netCents: num(row[10]),
    danielCents: num(row[12]),
    gusCents: num(row[13]),
  };
}

export interface DealReconciliation {
  input: MirrorDealInput;
  ours: MirrorComputed;
  sheet: MirrorComputed;
  /** ours − sheet, per figure, in cents. All-zero = the row reconciles. */
  driftCents: MirrorComputed;
  hasDrift: boolean;
}

export interface MirrorReport {
  deals: DealReconciliation[];
  rowCount: number;
  driftRowCount: number;
  /** Sum of |drift| across every figure of every deal. Zero is the pass. */
  totalAbsDriftCents: number;
  totals: { ours: MirrorComputed; sheet: MirrorComputed };
}

const ZERO: MirrorComputed = {
  arCents: 0,
  feeCents: 0,
  netCents: 0,
  danielCents: 0,
  gusCents: 0,
};

const KEYS = Object.keys(ZERO) as (keyof MirrorComputed)[];

function addInto(target: MirrorComputed, source: MirrorComputed): void {
  for (const k of KEYS) target[k] += source[k];
}

/**
 * Reconcile the whole sheet: recompute every Raw Data row and diff against the
 * sheet's own New Deals figures. Rows are matched positionally — both tabs
 * derive from the same physical rows, so index i in one is index i in the
 * other; a missing computed row diffs against zeros and shows up loudly.
 */
export function reconcileSheet(
  rawRows: Cell[][],
  computedRows: Cell[][],
): MirrorReport {
  const deals: DealReconciliation[] = [];
  const totalsOurs = { ...ZERO };
  const totalsSheet = { ...ZERO };
  let totalAbsDriftCents = 0;

  rawRows.forEach((row, i) => {
    const input = parseRawRow(row, i + 2);
    if (!input) return;
    const ours = computeDeal(input);
    const sheet = computedRows[i]
      ? parseSheetComputedRow(computedRows[i])
      : { ...ZERO };
    const driftCents = { ...ZERO };
    let hasDrift = false;
    for (const k of KEYS) {
      driftCents[k] = ours[k] - sheet[k];
      if (driftCents[k] !== 0) hasDrift = true;
      totalAbsDriftCents += Math.abs(driftCents[k]);
    }
    addInto(totalsOurs, ours);
    addInto(totalsSheet, sheet);
    deals.push({ input, ours, sheet, driftCents, hasDrift });
  });

  return {
    deals,
    rowCount: deals.length,
    driftRowCount: deals.filter((d) => d.hasDrift).length,
    totalAbsDriftCents,
    totals: { ours: totalsOurs, sheet: totalsSheet },
  };
}
