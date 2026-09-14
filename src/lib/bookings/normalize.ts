/**
 * Booking normalizers — pure. Calendly's and iClosed's API shapes are both
 * documented/probed directly; anything else (webhooks from schedulers with no
 * usable API) goes through the defensive generic probe. No id = rejected:
 * without an id there is no idempotency.
 */

export interface NormalizedBooking {
  externalId: string;
  eventType: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  /** booked · canceled · unknown */
  status: string;
  /** Cancelled because it moved to another time — a reschedule, not a no. */
  rescheduled: boolean;
  startsAt: string | null;
  bookedAt: string | null;
}

const RESCHEDULE_WORDS = /resched/i;

type Payload = Record<string, unknown>;

const asRecord = (v: unknown): Payload =>
  typeof v === "object" && v !== null ? (v as Payload) : {};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** Calendly scheduled_events entries: uri is the id; status active|canceled. */
export function normalizeCalendlyEvent(
  payload: Payload,
  invitee?: Payload,
): NormalizedBooking | null {
  const uri = str(payload.uri);
  if (!uri) return null;
  const status = (str(payload.status) ?? "").toLowerCase();
  const inv = asRecord(invitee);
  return {
    externalId: uri.split("/").pop() ?? uri,
    eventType: str(payload.name),
    inviteeName: str(inv.name),
    inviteeEmail: str(inv.email),
    status:
      status === "canceled" ? "canceled" : status === "active" ? "booked" : "unknown",
    // Calendly marks the OLD invitee of a moved booking `rescheduled: true`;
    // its event is cancelled and a new event carries the new time.
    rescheduled: inv.rescheduled === true,
    startsAt: str(payload.start_time),
    bookedAt: str(payload.created_at),
  };
}

/**
 * iClosed `/v1/eventCalls` entries (probed directly against the live API,
 * 2026-09-12 — no public schema doc for this shape).
 *
 * The invitee's email ships INLINE as `inviteeEmail`, with a duplicate copy
 * on `contact.email` — no separate `/v1/contacts` join is needed (both are
 * present on every record observed; `contact.email` is kept only as a
 * defensive fallback). `dateTimeUTC` is the real ISO timestamp; the sibling
 * `dateTime` field is rendered in some other, unspecified timezone (its clock
 * value does not match `dateTimeUTC`), so it is never used here — a wrong
 * guess at its offset is worse than a null `startsAt`. `eventType` on the
 * payload itself is iClosed's temporal bucket (PAST/UPCOMING), not a
 * booked/canceled status — that only comes from `cancelReason`.
 */
export function normalizeIclosedEventCall(payload: Payload): NormalizedBooking | null {
  const rawId = payload.id;
  const id = typeof rawId === "number" ? String(rawId) : str(rawId);
  if (!id) return null;
  const event = asRecord(payload.event);
  const contact = asRecord(payload.contact);
  return {
    externalId: id,
    eventType: str(event.name) ?? str(payload.callType),
    inviteeName: str(payload.inviteeName),
    inviteeEmail: str(payload.inviteeEmail) ?? str(contact.email),
    status: str(payload.cancelReason) ? "canceled" : "booked",
    rescheduled: RESCHEDULE_WORDS.test(str(payload.cancelReason) ?? ""),
    startsAt: str(payload.dateTimeUTC),
    bookedAt: str(payload.createdAt),
  };
}

/** Anything that can POST a webhook: iClosed and future schedulers. */
export function normalizeGenericBooking(payload: Payload): NormalizedBooking | null {
  const data = asRecord(payload.data);
  const id =
    str(payload.id) ??
    str(payload.booking_id) ??
    str(payload.event_id) ??
    str(data.id) ??
    str(data.booking_id);
  if (!id) return null;
  const rawStatus = (
    str(payload.status) ??
    str(payload.event) ??
    str(payload.type) ??
    ""
  ).toLowerCase();
  const canceled = rawStatus.includes("cancel");
  return {
    externalId: id,
    eventType:
      str(payload.event_type) ?? str(payload.event_name) ?? str(data.event_type),
    inviteeName:
      str(payload.name) ??
      str(payload.invitee_name) ??
      str(data.name) ??
      str(data.invitee_name),
    inviteeEmail:
      str(payload.email) ??
      str(payload.invitee_email) ??
      str(data.email) ??
      str(data.invitee_email),
    status: canceled ? "canceled" : rawStatus ? "booked" : "unknown",
    rescheduled: RESCHEDULE_WORDS.test(rawStatus),
    startsAt: str(payload.start_time) ?? str(payload.starts_at) ?? str(data.start_time),
    bookedAt: str(payload.created_at) ?? str(payload.booked_at) ?? str(data.created_at),
  };
}
