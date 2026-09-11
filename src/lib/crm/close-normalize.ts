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

/**
 * The lead's best email from a Close LEAD payload (`/api/v1/lead/{id}`).
 *
 * Close nests emails under contacts: lead → contacts[] → emails[] → email.
 * First contact's first email wins — Close orders contacts primary-first.
 * Lowercased, because speed-to-lead joins on the application's email and the
 * application side is already lowercased at parse.
 */
export function emailFromCloseLead(payload: Record<string, unknown>): string | null {
  const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  for (const contact of contacts) {
    if (typeof contact !== "object" || contact === null) continue;
    const emails = (contact as Record<string, unknown>).emails;
    if (!Array.isArray(emails)) continue;
    for (const entry of emails) {
      if (typeof entry !== "object" || entry === null) continue;
      const email = (entry as Record<string, unknown>).email;
      if (typeof email === "string" && email.includes("@")) {
        return email.trim().toLowerCase();
      }
    }
  }
  return null;
}

/**
 * Whether a captured activity's `direction` means "we reached out" — Close
 * does not use one vocabulary across activity types: calls and texts say
 * outbound/inbound, but email activity says outgoing/incoming instead
 * (confirmed against live captured data, not assumed). Speed-to-lead only
 * ever counts an OUTBOUND touch as first contact, so every reader of
 * `direction` for that purpose must go through this rather than comparing to
 * `"outbound"` directly, or every outgoing email silently drops out of the
 * measurement.
 */
export function isOutboundDirection(direction: string | null): boolean {
  return direction === "outbound" || direction === "outgoing";
}

/**
 * A phone as a JOIN KEY: the last ten digits, or null when fewer survive.
 *
 * "+1 (555) 010-2030", "15550102030" and "555-010-2030" are one number typed
 * three ways; country codes and formatting never survive a sheet round-trip,
 * so the last ten digits are the stable part. Under ten digits is not a US
 * number worth joining on — null, never a guess.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** The lead's best phone from a Close LEAD payload — same walk as the email. */
export function phoneFromCloseLead(payload: Record<string, unknown>): string | null {
  const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  for (const contact of contacts) {
    if (typeof contact !== "object" || contact === null) continue;
    const phones = (contact as Record<string, unknown>).phones;
    if (!Array.isArray(phones)) continue;
    for (const entry of phones) {
      if (typeof entry !== "object" || entry === null) continue;
      const phone = (entry as Record<string, unknown>).phone;
      const key = phoneKey(typeof phone === "string" ? phone : null);
      if (key) return key;
    }
  }
  return null;
}
