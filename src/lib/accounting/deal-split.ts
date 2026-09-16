/**
 * HOW ONE DEAL'S NET CASH IS DIVIDED.
 *
 * The finance sheet has always had a third kind of claim on a deal — "10% to
 * jaiden", "Owe Gerard 313.39" — but only ever as free text in the Notes
 * column. Nothing computed it, so the partner split shown for those deals was
 * never what actually got paid. This models it properly, so a new deal can
 * carry its extra payees as data instead of a sentence nobody can total.
 *
 * The order of operations, which is the whole thing:
 *
 *   cash collected
 *     − processor fee        → NET          (sheet-mirror's computeDeal)
 *     − additional payees                   (here)
 *     = remaining            → split between the partners by their share
 *
 * A percentage payee is a percentage OF NET, not of what is left after the
 * payee before them. Otherwise two payees on the same deal would each be
 * measured against a different base and neither could check their own cut.
 *
 * PENNIES. Every figure is integer cents and nothing is ever allowed to
 * evaporate: each payee and each partner is rounded half-away-from-zero, and
 * the LAST partner takes the remainder, so the parts always re-add to the
 * whole exactly. That is the same trick `computeDeal` uses for Gus.
 *
 * OVERDRAW. Payees can be entered that total more than the deal made. That is
 * a data-entry mistake, not a negative payout, so the split reports
 * `overdrawn` and leaves the partners at zero rather than inventing a debt.
 *
 * Pure: no database, no clock, integer cents in and out.
 */

/** Round half away from zero — matches the money lib and the sheet. */
const roundHalfAway = (value: number): number =>
  value < 0 ? -Math.round(-value) : Math.round(value);

export type PayeeKind = "fixed" | "percent";

export interface DealPayee {
  /** Who is owed. Free text — this is not a GV user. */
  name: string;
  kind: PayeeKind;
  /** Cents when kind is "fixed"; basis points of NET when "percent". */
  value: number;
}

export interface PartnerShare {
  name: string;
  /** Basis points. The shares should total 10,000. */
  bps: number;
}

export interface SettledPayee {
  name: string;
  kind: PayeeKind;
  /** What this payee is actually owed on this deal, in cents. */
  cents: number;
}

export interface DealSplit {
  netCents: number;
  payees: SettledPayee[];
  payeeTotalCents: number;
  /** Net less the payees — what the partners divide. Never negative. */
  remainingCents: number;
  partners: { name: string; cents: number }[];
  /** True when the payees claim more than the deal made. */
  overdrawn: boolean;
}

/** What one payee is owed out of this net. */
export function payeeCents(netCents: number, payee: DealPayee): number {
  return payee.kind === "fixed"
    ? payee.value
    : roundHalfAway((netCents * payee.value) / 10_000);
}

export function splitDeal(
  netCents: number,
  payees: DealPayee[],
  partners: PartnerShare[],
): DealSplit {
  const settled: SettledPayee[] = payees.map((p) => ({
    name: p.name,
    kind: p.kind,
    cents: payeeCents(netCents, p),
  }));
  const payeeTotalCents = settled.reduce((n, p) => n + p.cents, 0);
  // Claiming nothing cannot overdraw anything. Without the first test, a deal
  // whose fee exceeded its cash (negative net, no payees) reported an overdraw
  // and zeroed the loss away instead of showing it.
  const overdrawn = payeeTotalCents > 0 && payeeTotalCents > netCents;

  // An overdrawn deal pays the partners nothing rather than a negative share.
  // The figure is wrong either way; a negative payout would look deliberate.
  const remainingCents = overdrawn ? 0 : netCents - payeeTotalCents;

  // Every partner but the last is rounded; the last absorbs what is left, so
  // the shares always re-add to `remainingCents` to the penny.
  const partnerCents = partners.map((partner, i) => {
    if (i === partners.length - 1) return { name: partner.name, cents: 0 };
    return {
      name: partner.name,
      cents: roundHalfAway((remainingCents * partner.bps) / 10_000),
    };
  });
  if (partnerCents.length > 0) {
    const assigned = partnerCents.slice(0, -1).reduce((n, p) => n + p.cents, 0);
    partnerCents[partnerCents.length - 1].cents = remainingCents - assigned;
  }

  return {
    netCents,
    payees: settled,
    payeeTotalCents,
    remainingCents,
    partners: partnerCents,
    overdrawn,
  };
}

/**
 * The payees as one line of text, for the finance sheet's Notes column.
 *
 * The sheet is still the system of record and its column order is locked, so
 * additional payouts ride in the note rather than as new columns — but in a
 * shape that can be read back, instead of the prose that made them
 * uncountable in the first place. Once the form becomes the system of record
 * they move to the `deal_payees` table and this becomes a display detail.
 *
 * "Payouts: Jaiden 10%; Gerard $313.39"
 */
export function payeesNote(payees: DealPayee[]): string {
  if (payees.length === 0) return "";
  const parts = payees.map((p) =>
    p.kind === "percent"
      ? `${p.name} ${p.value / 100}%`
      : `${p.name} $${(p.value / 100).toFixed(2)}`,
  );
  return `Payouts: ${parts.join("; ")}`;
}

/** The note a deal carries, with its payees appended when it has any. */
export function noteWithPayees(notes: string, payees: DealPayee[]): string {
  const line = payeesNote(payees);
  if (line === "") return notes.trim();
  const base = notes.trim();
  return base === "" ? line : `${base} — ${line}`;
}
