/**
 * WHAT WAS SOLD versus WHAT ACTUALLY ARRIVED.
 *
 * A client's tracking sheet records the same sale twice, on purpose and in two
 * different roles. The New Deals tab is the CLOSER'S record — a deal happened,
 * here is who closed it and for how much. The Payment Log is the PROCESSOR'S
 * record — money moved, here is the transaction id.
 *
 * They are not interchangeable and they must never be added together: on The
 * Grid, 11 of 17 deals also appear in the Payment Log, so summing both counts
 * the same money twice.
 *
 * Nor is either one "the" answer:
 *   • a deal logged today whose payment plan runs for months shows its full
 *     value in New Deals and only the first instalment in the Payment Log;
 *   • money that arrives by wire or Zelle never appears in a processor's record
 *     at all, so the deal form is the ONLY evidence it happened.
 *
 * So this does not pick a winner. It reports both, matches them where it can,
 * and names what is left over in each direction — which is the job the deal
 * forms were described as doing: verifying and validating what the processors
 * report.
 */

export interface DealRow {
  email: string | null;
  cashCents: number | null;
  program: string | null;
  occurredAt: Date | null;
}

export interface PaymentRow {
  email: string | null;
  cashCents: number | null;
  processor: string | null;
}

export interface CashReconciliation {
  /** Total the closers logged as collected. */
  dealsCents: number;
  /** Total the processors actually recorded. */
  processorCents: number;
  /** Deals whose money no processor shows — wires, Zelle, or not yet paid. */
  unbackedDeals: { email: string; cashCents: number; program: string | null }[];
  unbackedCents: number;
  /** Payments that cannot be tied to a logged deal. */
  unmatchedPaymentCents: number;
  unmatchedPaymentCount: number;
  /** Processor totals, so a retired one is visible rather than lumped in. */
  byProcessor: { processor: string; cents: number; count: number }[];
}

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export function reconcileCash(
  deals: DealRow[],
  payments: PaymentRow[],
): CashReconciliation {
  const paidByEmail = new Map<string, number>();
  for (const p of payments) {
    const key = norm(p.email);
    if (key === "") continue;
    paidByEmail.set(key, (paidByEmail.get(key) ?? 0) + (p.cashCents ?? 0));
  }

  const dealsCents = deals.reduce((s, d) => s + (d.cashCents ?? 0), 0);
  const processorCents = payments.reduce((s, p) => s + (p.cashCents ?? 0), 0);

  // A deal with no payment behind it. Matched on the lead's email, which is
  // the only identifier both tabs carry.
  const unbacked = deals
    .filter((d) => norm(d.email) !== "" && !paidByEmail.has(norm(d.email)))
    .map((d) => ({
      email: d.email as string,
      cashCents: d.cashCents ?? 0,
      program: d.program,
    }))
    .sort((a, b) => b.cashCents - a.cashCents);

  const dealEmails = new Set(deals.map((d) => norm(d.email)).filter((e) => e !== ""));
  const unmatched = payments.filter(
    (p) => norm(p.email) === "" || !dealEmails.has(norm(p.email)),
  );

  const byProcessor = new Map<string, { cents: number; count: number }>();
  for (const p of payments) {
    const key = (p.processor ?? "Unrecorded").trim() || "Unrecorded";
    const entry = byProcessor.get(key) ?? { cents: 0, count: 0 };
    entry.cents += p.cashCents ?? 0;
    entry.count += 1;
    byProcessor.set(key, entry);
  }

  return {
    dealsCents,
    processorCents,
    unbackedDeals: unbacked,
    unbackedCents: unbacked.reduce((s, d) => s + d.cashCents, 0),
    unmatchedPaymentCents: unmatched.reduce((s, p) => s + (p.cashCents ?? 0), 0),
    unmatchedPaymentCount: unmatched.length,
    byProcessor: [...byProcessor.entries()]
      .map(([processor, v]) => ({ processor, ...v }))
      .sort((a, b) => b.cents - a.cents),
  };
}
