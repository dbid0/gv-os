/**
 * Booking normalizers — pure. Calendly's API shape is documented; everything
 * else (iClosed webhooks, future schedulers) goes through the defensive
 * generic probe. No id = rejected: without an id there is no idempotency.
 */

export interface NormalizedBooking {
  externalId: string;
  eventType: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  /** booked · canceled · unknown */
  status: string;
  startsAt: string | null;
  bookedAt: string | null;
}

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
    startsAt: str(payload.start_time),
    bookedAt: str(payload.created_at),
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
    startsAt: str(payload.start_time) ?? str(payload.starts_at) ?? str(data.start_time),
    bookedAt: str(payload.created_at) ?? str(payload.booked_at) ?? str(data.created_at),
  };
}
