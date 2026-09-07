import { classifyPayment, totalPayments } from "@/lib/tracking/refunds";

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
  /** succeeded · refunded · failed — see lib/tracking/refunds. */
  status?: string | null;
}

export interface CashReconciliation {
  /** Total the closers logged as collected. */
  dealsCents: number;
  /**
   * What the processors NETTED — gross taken, less anything refunded.
   *
   * A payment log that cannot express a refund overstates cash by whatever
   * went back, permanently and invisibly, so the net is what a month is
   * judged on and the parts are shown beside it.
   */
  processorCents: number;
  processorGrossCents: number;
  refundedCents: number;
  refundedCount: number;
  /** Charges that never completed — counted in neither total. */
  failedCents: number;
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
  // Refunds subtract; failed charges count nowhere.
  const totals = totalPayments(
    payments.map((p) => ({ cashCents: p.cashCents, status: p.status ?? null })),
  );
  const processorCents = totals.netCents;

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

  // Per processor, NET: a refund on Stripe reduces Stripe's own figure rather
  // than appearing nowhere.
  const byProcessor = new Map<string, { cents: number; count: number }>();
  for (const p of payments) {
    const key = (p.processor ?? "Unrecorded").trim() || "Unrecorded";
    const entry = byProcessor.get(key) ?? { cents: 0, count: 0 };
    const outcome = classifyPayment({
      cashCents: p.cashCents,
      status: p.status ?? null,
    });
    if (outcome === "failed") continue;
    const amount = Math.abs(p.cashCents ?? 0);
    entry.cents += outcome === "refunded" ? -amount : amount;
    entry.count += 1;
    byProcessor.set(key, entry);
  }

  return {
    dealsCents,
    processorCents,
    processorGrossCents: totals.grossCents,
    refundedCents: totals.refundedCents,
    refundedCount: totals.refundedCount,
    failedCents: totals.failedCents,
    unbackedDeals: unbacked,
    unbackedCents: unbacked.reduce((s, d) => s + d.cashCents, 0),
    unmatchedPaymentCents: unmatched.reduce((s, p) => s + (p.cashCents ?? 0), 0),
    unmatchedPaymentCount: unmatched.length,
    byProcessor: [...byProcessor.entries()]
      .map(([processor, v]) => ({ processor, ...v }))
      .sort((a, b) => b.cents - a.cents),
  };
}
