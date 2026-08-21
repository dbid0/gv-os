/**
 * Close CRM activity normalizers — pure.
 *
 * Close's /activity/call/, /activity/sms/, /activity/email/ payloads share an
 * envelope (id, user_id, date_created, lead_id) and differ per type. Each
 * normalizer produces the common capture shape; the activity's own `id` is the
 * idempotency key, so re-pulling a window can never double-count a dial.
 */

export interface NormalizedActivity {
  externalId: string;
  /** call · sms · email */
  kind: string;
  userId: string | null;
  userName: string | null;
  direction: string | null;
  /** Talk time for calls; null elsewhere. */
  durationSeconds: number | null;
  occurredAt: string | null;
  leadId: string | null;
}

type Payload = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function normalizeCloseActivity(
  kind: "call" | "sms" | "email",
  payload: Payload,
): NormalizedActivity | null {
  const id = str(payload.id);
  if (!id) return null;
  return {
    externalId: id,
    kind,
    userId: str(payload.user_id),
    userName: str(payload.user_name),
    direction: str(payload.direction),
    durationSeconds: kind === "call" ? num(payload.duration) : null,
    occurredAt: str(payload.date_created),
    leadId: str(payload.lead_id),
  };
}
