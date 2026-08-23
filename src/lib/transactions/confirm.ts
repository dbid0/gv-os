/**
 * The processor → backlog confirm step (punch-list 15). A captured payment
 * event becomes a transaction ONLY through this mapping, and only on an
 * explicit human confirm — capture is aggressive, posting is deliberate.
 * Pure and fully gated: this is money.
 */

export interface CapturedPaymentEvent {
  provider: string;
  externalId: string;
  clientId: string | null;
  /** charge · refund · unknown */
  kind: string;
  amountCents: number;
  currency: string;
  email: string | null;
  label: string | null;
}

/** Replay-proof identity for a posted processor event. */
export function processorIdempotencyKey(e: CapturedPaymentEvent): string {
  return `processor:${e.provider}:${e.externalId}`;
}

export interface ConfirmableRow {
  occurredOn: string;
  direction: "in" | "out";
  layer: "agency" | "client";
  clientId: string | null;
  description: string | null;
  paymentMethod: string;
  revenueCents: number;
  cashCents: number;
  leadEmail: string | null;
  source: "processor";
  idempotencyKey: string;
}

export type ConfirmMapping =
  { ok: true; row: ConfirmableRow } | { ok: false; reason: string };

/**
 * Map a captured event to the backlog row a confirm would append. Anything
 * ambiguous refuses with a reason instead of guessing — an unknown kind or a
 * non-USD amount stays in the queue until a human resolves it at the source.
 */
export function paymentEventToTransaction(
  e: CapturedPaymentEvent,
  occurredOn: string,
): ConfirmMapping {
  if (e.currency.toLowerCase() !== "usd") {
    return { ok: false, reason: `Unsupported currency ${e.currency}.` };
  }
  if (!Number.isInteger(e.amountCents) || e.amountCents <= 0) {
    return { ok: false, reason: "Amount must be a positive whole number of cents." };
  }
  if (e.kind !== "charge" && e.kind !== "refund") {
    return { ok: false, reason: `Unrecognized event kind "${e.kind}".` };
  }
  return {
    ok: true,
    row: {
      occurredOn,
      direction: e.kind === "charge" ? "in" : "out",
      layer: e.clientId ? "client" : "agency",
      clientId: e.clientId,
      description: e.label,
      paymentMethod: e.provider,
      revenueCents: e.kind === "charge" ? e.amountCents : 0,
      cashCents: e.amountCents,
      leadEmail: e.email,
      source: "processor",
      idempotencyKey: processorIdempotencyKey(e),
    },
  };
}
