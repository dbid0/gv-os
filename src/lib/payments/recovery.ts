/**
 * Failed-payment recovery — the pure classification layer.
 *
 * A declined charge is captured as a `payment_events` row with kind "failed".
 * It is visibility only: it can NEVER post to the ledger and never counts in
 * gross, net, revenue, or cash (the confirm mapping in transactions/confirm.ts
 * refuses any kind but charge/refund). The money on it is *attempted*, not
 * collected — the whole point of the recovery inbox is that it has NOT come in.
 *
 * Two independent facts describe a failed charge:
 *
 * 1. Whether it was RECOVERED — did the same customer later succeed? That is
 *    derived here, purely, from the succeeded charges on the same connection.
 *    It is a fact about what happened, not an opinion.
 * 2. The admin DISPOSITION — chasing · recovered · written_off · (null). What a
 *    human decided to do about it. Set by hand, stored on the row.
 *
 * `effectiveRecoveryStatus` folds the two into the single state the inbox
 * shows. Kept pure (no server-only, no DB) so it is trivially testable and the
 * page and its tests share one source of truth.
 */

/** Admin-settable dispositions on a failed charge. Null = untouched. */
export const RECOVERY_DISPOSITIONS = ["chasing", "recovered", "written_off"] as const;
export type RecoveryDisposition = (typeof RECOVERY_DISPOSITIONS)[number];

export function isRecoveryDisposition(v: unknown): v is RecoveryDisposition {
  return (
    typeof v === "string" && (RECOVERY_DISPOSITIONS as readonly string[]).includes(v)
  );
}

/** The derived fact: did the same customer succeed later, or never? */
export type RecoveryClass = "recovered" | "unrecovered";

/** The single state the inbox renders per row. */
export type EffectiveRecoveryStatus = "recovered" | "chasing" | "written_off" | "open";

export interface FailedCharge {
  /** The processor customer id, when the payload carried one. */
  customerRef: string | null;
  /** Payer email, when present. */
  email: string | null;
  /** When the attempt was declined. Null when the payload had no timestamp. */
  occurredAt: Date | null;
}

export interface SucceededCharge {
  customerRef: string | null;
  email: string | null;
  occurredAt: Date | null;
}

const normEmail = (e: string | null): string | null => {
  const t = e?.trim().toLowerCase();
  return t ? t : null;
};

/**
 * Same human? A shared processor customer id is definitive; otherwise a shared
 * (normalized) email. A blank id or email on either side never matches, so two
 * rows that simply both lack an email are never fused into one customer.
 */
function sameCustomer(a: FailedCharge, b: SucceededCharge): boolean {
  if (a.customerRef && b.customerRef && a.customerRef === b.customerRef) return true;
  const ea = normEmail(a.email);
  const eb = normEmail(b.email);
  return ea !== null && ea === eb;
}

/**
 * Did this failed charge get recovered? Recovered = the same customer has a
 * succeeded charge that did NOT clearly precede the failure.
 *
 * Ordering rule: only when BOTH timestamps are known and the success came
 * strictly before the failure do we rule that success out (it was a different,
 * earlier purchase). If either timestamp is missing we cannot order them, so an
 * identity match counts as recovered — the safe direction here is to drop it
 * off the chase list rather than dun a customer who has already paid. Money is
 * never at stake in this call: a failed charge is visibility-only either way.
 */
export function classifyRecovery(
  failed: FailedCharge,
  succeeded: readonly SucceededCharge[],
): RecoveryClass {
  for (const s of succeeded) {
    if (!sameCustomer(failed, s)) continue;
    if (failed.occurredAt && s.occurredAt && s.occurredAt < failed.occurredAt) {
      continue;
    }
    return "recovered";
  }
  return "unrecovered";
}

/**
 * The state the inbox shows. A derived recovery wins outright — the money came
 * in, nothing to chase, whatever the disposition said. Otherwise the admin's
 * disposition speaks (including a manual "recovered" when they know something
 * the data does not yet). With neither, the charge is "open": failed and
 * untouched, the row that most needs a human.
 */
export function effectiveRecoveryStatus(
  recoveryClass: RecoveryClass,
  disposition: RecoveryDisposition | null,
): EffectiveRecoveryStatus {
  if (recoveryClass === "recovered") return "recovered";
  if (disposition === "recovered") return "recovered";
  if (disposition === "written_off") return "written_off";
  if (disposition === "chasing") return "chasing";
  return "open";
}

/**
 * Still-recoverable = money attempted, not yet in, not given up on. Open and
 * chasing count; recovered (it came in) and written_off (given up) do not.
 */
export function isStillRecoverable(status: EffectiveRecoveryStatus): boolean {
  return status === "open" || status === "chasing";
}

/** True for any row the inbox should surface — everything but a recovery. */
export function isUnrecovered(status: EffectiveRecoveryStatus): boolean {
  return status !== "recovered";
}

/**
 * Sum of still-recoverable attempted cents. This is NOT revenue and NOT cash —
 * it is money that failed to collect and might yet be chased. Integer cents in,
 * integer cents out.
 */
export function recoverableTotalCents(
  rows: readonly { amountCents: number; effectiveStatus: EffectiveRecoveryStatus }[],
): number {
  return rows.reduce(
    (total, r) =>
      isStillRecoverable(r.effectiveStatus) ? total + r.amountCents : total,
    0,
  );
}
