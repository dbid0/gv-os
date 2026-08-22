/**
 * PandaDoc + Typeform normalizers — pure, defensive, id-or-reject.
 */

type Payload = Record<string, unknown>;

const asRecord = (v: unknown): Payload =>
  typeof v === "object" && v !== null ? (v as Payload) : {};

const asArray = (v: unknown): Payload[] =>
  Array.isArray(v)
    ? (v.filter((x) => typeof x === "object" && x !== null) as Payload[])
    : [];

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

export interface NormalizedDoc {
  externalId: string;
  name: string | null;
  docStatus: string;
  recipientEmail: string | null;
  completedAt: string | null;
}

/** One entry from PandaDoc `GET /documents/` — kept only when completed. */
export function normalizePandaDoc(payload: Payload): NormalizedDoc | null {
  const id = str(payload.id);
  if (!id) return null;
  const status = str(payload.status) ?? "unknown";
  const recipients = asArray(payload.recipients);
  return {
    externalId: id,
    name: str(payload.name),
    docStatus: status,
    recipientEmail: str(recipients[0]?.email),
    completedAt: str(payload.date_completed) ?? str(payload.date_modified),
  };
}

export function isCompletedDoc(doc: NormalizedDoc): boolean {
  return doc.docStatus === "document.completed";
}

export interface NormalizedApplication {
  externalId: string;
  email: string | null;
  name: string | null;
  submittedAt: string | null;
}

/** One Typeform response: email = first email answer, name = first text answer. */
export function normalizeTypeformResponse(
  payload: Payload,
): NormalizedApplication | null {
  const id = str(payload.response_id) ?? str(payload.token);
  if (!id) return null;
  let email: string | null = null;
  let name: string | null = null;
  for (const answer of asArray(payload.answers)) {
    if (!email && answer.type === "email") email = str(answer.email);
    if (!name && (answer.type === "text" || answer.type === "short_text")) {
      name = str(answer.text);
    }
  }
  return {
    externalId: id,
    email,
    name,
    submittedAt: str(payload.submitted_at),
  };
}
