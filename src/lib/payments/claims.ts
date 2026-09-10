/**
 * Payment claim rules — the pure half of the claims layer.
 *
 * A claim credits one rep with one SEAT on one payment. The money rules that
 * keep this honest, enforced here and tested:
 * - Claims never touch the payment or the ledger — they are rows beside it.
 * - One claim per (payment, role): a payment has one setter, one closer, one
 *   DM setter at most. Re-claiming a seat REPLACES the old claim explicitly,
 *   never stacks.
 * - The claimed rep must belong to the payment's client — a rep on one offer
 *   can never quietly claim another offer's cash.
 * - Rate overrides are basis points in [0, 10000]; null means the commission
 *   rules decide later. An override outside the range is a validation error,
 *   never clamped — silently "fixing" money input invents a number nobody set.
 */

export const CLAIM_ROLES = ["setter", "closer", "dm_setter"] as const;
export type ClaimRole = (typeof CLAIM_ROLES)[number];

export function isClaimRole(v: string): v is ClaimRole {
  return (CLAIM_ROLES as readonly string[]).includes(v);
}

export type ClaimValidationInput = {
  role: string;
  rateOverrideBps: number | null;
  /** The payment's client scope (null = agency-level payment). */
  paymentClientId: string | null;
  /** The rep's client scope. */
  repClientId: string;
};

export type ClaimValidation =
  { ok: true; role: ClaimRole } | { ok: false; reason: string };

export function validateClaim(input: ClaimValidationInput): ClaimValidation {
  if (!isClaimRole(input.role)) {
    return { ok: false, reason: `Unknown seat "${input.role}".` };
  }
  if (input.rateOverrideBps !== null) {
    if (
      !Number.isInteger(input.rateOverrideBps) ||
      input.rateOverrideBps < 0 ||
      input.rateOverrideBps > 10000
    ) {
      return {
        ok: false,
        reason: "Rate override must be whole basis points between 0 and 10000.",
      };
    }
  }
  if (input.paymentClientId === null) {
    return {
      ok: false,
      reason: "Agency-level payments carry no offer, so no rep can claim them.",
    };
  }
  if (input.paymentClientId !== input.repClientId) {
    return {
      ok: false,
      reason: "That rep sells for a different offer than this payment.",
    };
  }
  return { ok: true, role: input.role };
}
