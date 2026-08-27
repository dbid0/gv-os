/**
 * The WRITE side of the finance-sheet sync: build a "Raw Data" row from a deal
 * logged in GV OS, so an agency deal entered here lands in the same sheet the
 * mirror reads back from — a true two-way sync.
 *
 * The column order MUST match what `parseRawRow` (sheet-mirror.ts) reads, or the
 * numbers break. That invariant is locked by the round-trip test
 * (tests/unit/sheet-write.test.ts): build a row here, parse it there, assert
 * identical. Change a column here and the test fails.
 *
 * Raw Data columns (A–M):
 *   A timestamp · B date closed · C client · D deal type · E offer · F revenue
 *   · G cash · H method · I Daniel % · J fee override · K agreement · L notes
 *   · M payout status
 *
 * Money is written as DOLLARS (the sheet's unit; the mirror multiplies ×100).
 * Pure — no I/O — so it's fully testable; the append call lives in google/sheets.
 */

export interface AgencyDealInput {
  /** YYYY-MM-DD — isoDate() reads this shape back losslessly. */
  dateClosed: string;
  client: string;
  dealType: string;
  offer: string;
  revenueCents: number;
  cashCents: number;
  method: string;
  /** Daniel's % as entered (30, 45, 50…); null = blank (formula applies). */
  pctEntered: number | null;
  /** Per-deal fee override in cents; null = blank. */
  feeOverrideCents: number | null;
  agreement: string;
  notes: string;
  payoutStatus: string;
}

/** Dollars from integer cents, kept exact (no float drift for whole cents). */
function dollars(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * The 13-cell Raw Data row (A–M) for `values.append`. `timestamp` is passed in
 * (callers stamp it) so this stays pure. Blank numeric cells are "" — exactly
 * what parseRawRow treats as "not entered".
 */
export function financeRawRow(
  input: AgencyDealInput,
  timestamp: string,
): (string | number)[] {
  return [
    timestamp, // A
    input.dateClosed, // B
    input.client, // C
    input.dealType, // D
    input.offer, // E
    dollars(input.revenueCents), // F
    dollars(input.cashCents), // G
    input.method, // H
    input.pctEntered ?? "", // I
    input.feeOverrideCents == null ? "" : dollars(input.feeOverrideCents), // J
    input.agreement, // K
    input.notes, // L
    input.payoutStatus, // M
  ];
}
