/**
 * Payment-event normalizers — one per processor, all pure.
 *
 * Each takes a raw webhook/API payload and produces the common shape the
 * capture table stores. The processor's own event id is the idempotency key:
 * a replayed webhook or a re-run pull can never double-capture.
 *
 * Money-safety note: capture is NOT the ledger. Events land in
 * `app.payment_events` and are posted to the append-only ledger only by a
 * deliberate action once they're attributed to a deal. A payload we can't
 * fully parse is still captured (kind "unknown") — visible, never silently
 * dropped — but an event with no usable id is rejected, because without an id
 * there is no idempotency.
 */

export interface NormalizedPayment {
  /** The processor's own id — the dedupe key. */
  externalId: string;
  /** charge · refund · unknown */
  kind: string;
  amountCents: number;
  currency: string;
  /** Payer email when the payload carries one. */
  email: string | null;
  /** ISO timestamp when the payload carries one. */
  occurredAt: string | null;
  /** What the processor called this event, for display. */
  label: string;
}

type Payload = Record<string, unknown>;

const asRecord = (v: unknown): Payload =>
  typeof v === "object" && v !== null ? (v as Payload) : {};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
};

/** Dollars (possibly fractional) → integer cents, half away from zero. */
export function dollarsToCents(dollars: number): number {
  const scaled = dollars * 100;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/**
 * Stripe events (`/v1/events` pulls and webhooks share this envelope).
 * Amounts are ALREADY integer cents. Refund-shaped types capture negative.
 */
export function normalizeStripe(payload: Payload): NormalizedPayment | null {
  const id = str(payload.id);
  if (!id) return null;
  const type = str(payload.type) ?? "unknown";
  const object = asRecord(asRecord(payload.data).object);
  const amount =
    num(object.amount_captured) ?? num(object.amount) ?? num(object.amount_paid) ?? 0;
  const refund = type.includes("refund") || type.includes("dispute");
  const created = num(payload.created);
  const billing = asRecord(object.billing_details);
  return {
    externalId: id,
    kind: refund ? "refund" : type.startsWith("charge") ? "charge" : "unknown",
    amountCents: refund ? -Math.abs(amount) : amount,
    currency: (str(object.currency) ?? "usd").toLowerCase(),
    email:
      str(billing.email) ?? str(object.receipt_email) ?? str(object.customer_email),
    occurredAt: created ? new Date(created * 1000).toISOString() : null,
    label: type,
  };
}

/**
 * Fanbasis. No public payload docs — field names probed defensively (the
 * proven GGV-portal pattern). Amounts arrive as DOLLARS.
 */
export function normalizeFanbasis(payload: Payload): NormalizedPayment | null {
  const id = str(payload.id) ?? str(payload.transaction_id) ?? str(payload.sale_id);
  if (!id) return null;
  const data = asRecord(payload.data);
  const dollars =
    num(payload.amount) ?? num(payload.total) ?? num(data.amount) ?? num(data.total);
  const refund = (str(payload.type) ?? str(payload.event) ?? "")
    .toLowerCase()
    .includes("refund");
  const email =
    str(payload.email) ??
    str(payload.buyer_email) ??
    str(payload.customer_email) ??
    str(data.email);
  const when = str(payload.created_at) ?? str(payload.date) ?? str(data.created_at);
  return {
    externalId: id,
    kind: dollars === null ? "unknown" : refund ? "refund" : "charge",
    amountCents:
      dollars === null
        ? 0
        : refund
          ? -Math.abs(dollarsToCents(dollars))
          : dollarsToCents(dollars),
    currency: "usd",
    email,
    occurredAt: when,
    label: str(payload.type) ?? str(payload.event) ?? "fanbasis sale",
  };
}

/** Whop webhooks: `{action, data: {id, final_amount, user_email, created_at}}`. Dollars. */
export function normalizeWhop(payload: Payload): NormalizedPayment | null {
  const data = asRecord(payload.data);
  const id = str(data.id) ?? str(payload.id);
  if (!id) return null;
  const action = (str(payload.action) ?? "").toLowerCase();
  const dollars = num(data.final_amount) ?? num(data.subtotal) ?? num(data.usd_amount);
  const refund = action.includes("refund");
  return {
    externalId: id,
    kind: dollars === null ? "unknown" : refund ? "refund" : "charge",
    amountCents:
      dollars === null
        ? 0
        : refund
          ? -Math.abs(dollarsToCents(dollars))
          : dollarsToCents(dollars),
    currency: "usd",
    email: str(data.user_email) ?? str(data.email),
    occurredAt: str(data.created_at),
    label: str(payload.action) ?? "whop payment",
  };
}

/** Anything else: capture visibly as unknown if any id exists. */
export function normalizeGeneric(payload: Payload): NormalizedPayment | null {
  const data = asRecord(payload.data);
  const id =
    str(payload.id) ??
    str(payload.event_id) ??
    str(payload.transaction_id) ??
    str(data.id);
  if (!id) return null;
  const dollars = num(payload.amount) ?? num(data.amount);
  return {
    externalId: id,
    kind: "unknown",
    amountCents: dollars === null ? 0 : dollarsToCents(dollars),
    currency: "usd",
    email: str(payload.email) ?? str(data.email),
    occurredAt: str(payload.created_at) ?? str(data.created_at),
    label: str(payload.type) ?? str(payload.event) ?? str(payload.action) ?? "payment",
  };
}

/** Dispatch by provider catalog value. Unlisted providers use the generic probe. */
export function normalizePayment(
  provider: string,
  payload: Payload,
): NormalizedPayment | null {
  switch (provider) {
    case "stripe":
      return normalizeStripe(payload);
    case "fanbasis":
      return normalizeFanbasis(payload);
    case "whop":
      return normalizeWhop(payload);
    default:
      return normalizeGeneric(payload);
  }
}
