import { TRACKING_FIELDS, type TrackingField } from "@/lib/tracking/fields";

/**
 * ASKING A MODEL WHAT A COLUMN MEANS.
 *
 * This is the one job in the tracking pipeline a model is genuinely better at
 * than a rule, and the reason is worth stating: the question is about WORDING,
 * not about data. "Does the column headed 'Booked Calls (net)' mean the same
 * thing our parser calls apptsSet?" has one right answer, a person can check
 * it in a second, and getting it wrong changes nothing until someone approves.
 *
 * What is deliberately NOT asked:
 *   • never to supply a missing value. 253 rows on the live sheets carry no
 *     date anywhere — not in a different format, not in another column, not in
 *     the notes. A model asked to fill those in would invent them, and they
 *     would feed per-day figures that feed decisions.
 *   • never to correct an amount. An unreadable number stays unknown.
 *
 * Pure: builds the prompt, parses the reply. The model call and the database
 * live in the script, so the judgement here is testable with no key.
 */

export interface ColumnSample {
  header: string;
  /** A few real values from that column, for context. */
  values: string[];
}

export interface ColumnProposal {
  header: string;
  field: TrackingField;
  reason: string;
}

export const COLUMN_PROPOSAL_SYSTEM = [
  "You map spreadsheet column headers onto a fixed set of known fields for a sales tracking sheet.",
  `The known fields are: ${TRACKING_FIELDS.join(", ")}.`,
  "occurredAt = when the event happened. email/name/phone = the LEAD's details.",
  "rep = the salesperson. status/outcome = what happened. cash/revenue = money.",
  "recordingUrl = a link to a call recording. notes = free text.",
  "Map a header ONLY when you are confident. Most columns map to nothing — a",
  "budget answer, a CRM id, a programme name are all their own thing, and",
  "guessing is worse than leaving them alone.",
  "Never infer or supply data. You are naming what a column MEANS, nothing else.",
  'Reply with ONLY a JSON array, no prose: [{"header": string, "field": string, "reason": string}]',
  "Return an empty array if nothing maps confidently.",
].join(" ");

export function buildColumnPrompt(tab: string, columns: ColumnSample[]): string {
  const lines = columns.map((c) => {
    const samples = c.values
      .filter((v) => v.trim() !== "")
      .slice(0, 4)
      .map((v) => (v.length > 40 ? `${v.slice(0, 40)}…` : v));
    return `- "${c.header}"${samples.length ? ` — e.g. ${samples.map((s) => JSON.stringify(s)).join(", ")}` : " — (no sample values)"}`;
  });
  return [
    `Sheet tab: ${tab}`,
    "",
    "Unrecognised columns:",
    ...lines,
    "",
    "Which of these map to a known field?",
  ].join("\n");
}

/** Pull the JSON array out of a reply that may be fenced or wrapped in prose. */
function extractArray(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  for (const raw of [fenced?.[1], reply].filter(
    (c): c is string => typeof c === "string",
  )) {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Parse a reply into proposals, keeping only what is usable.
 *
 * A proposal naming a field this app does not have, or a header that was not
 * asked about, is dropped rather than stored. The model is a source of
 * suggestions, not a source of schema.
 */
export function parseColumnProposals(reply: string, asked: string[]): ColumnProposal[] {
  const parsed = extractArray(reply);
  if (!Array.isArray(parsed)) return [];
  const known = new Set<string>(TRACKING_FIELDS);
  const askedFor = new Set(asked.map((h) => h.trim().toLowerCase()));
  const seen = new Set<string>();

  const out: ColumnProposal[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const header = typeof o.header === "string" ? o.header.trim() : "";
    const field = typeof o.field === "string" ? o.field.trim() : "";
    const reason = typeof o.reason === "string" ? o.reason.trim() : "";
    if (header === "" || !known.has(field)) continue;
    // Only columns we actually asked about, and one proposal per column.
    if (!askedFor.has(header.toLowerCase())) continue;
    if (seen.has(header.toLowerCase())) continue;
    seen.add(header.toLowerCase());
    out.push({ header, field: field as TrackingField, reason });
  }
  return out;
}
