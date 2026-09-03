import { normalizeHeading } from "@/lib/tracking/tabs";

/**
 * The handful of facts every tracking tab can offer, and the header names each
 * client's sheet uses for them.
 *
 * These are the columns worth promoting to real database columns because the
 * app queries across them — who the lead is, when it happened, which rep, how
 * much, and (for EOC) where the recording lives. Everything else on the row is
 * kept verbatim in a JSON payload, so nothing is lost and no column is invented.
 *
 * Aliases are matched on the NORMALIZED header, most specific first. A header
 * that matches nothing is not an error: it stays in the payload.
 */
export const TRACKING_FIELDS = [
  "occurredAt",
  "email",
  // `rep` is resolved BEFORE `name` deliberately. On the EOC and EOD tabs the
  // only person column is "Closer Name" / "Setter Name", and that is the REP —
  // the lead is identified by "Lead's Email". Resolving `name` first would file
  // the closer as the lead on every end-of-call report.
  "rep",
  "name",
  "phone",
  "status",
  "outcome",
  "cash",
  "revenue",
  "recordingUrl",
  "notes",
] as const;

export type TrackingField = (typeof TRACKING_FIELDS)[number];

/**
 * Ordered alias lists. Order matters within a field: the FIRST matching header
 * in the sheet wins, so the more specific date ("call date") is preferred over
 * the generic form-submission "timestamp", which is when the rep typed the
 * form — not when the call happened.
 */
const ALIASES: Record<TrackingField, string[]> = {
  occurredAt: [
    "call date",
    "deal date",
    "payment date",
    "submit date",
    "date added",
    "date",
    "timestamp",
  ],
  email: ["lead's email", "leads email", "lead email", "email", "client email"],
  // Deliberately excludes the rep columns: if a tab has only "Closer Name",
  // that is the rep and the lead's name is genuinely absent.
  name: ["client name", "first name", "lead name", "name"],
  phone: ["phone", "phone number"],
  rep: [
    "assigned rep",
    "closer name",
    "setter name",
    "sales rep name",
    "rep",
    "closer",
    "setter",
  ],
  status: ["lead status update", "status"],
  outcome: ["outcome", "call outcome", "result"],
  cash: [
    "cash collected",
    "total cash collected",
    "amount collected",
    "amount processed",
  ],
  revenue: ["revenue generated", "total revenue", "contracted revenue"],
  recordingUrl: [
    "call recording link",
    "recording link",
    "call recording",
    "recording",
  ],
  notes: ["detailed call notes", "notes", "note"],
};

/**
 * The columns a field may read, in preference order. Empty = the sheet has no
 * such column.
 *
 * A LIST, not a single index, because preference and presence are different
 * questions. The Grid's Applications tab carries both "Submit Date" and
 * "Timestamp": Submit Date is the better meaning, and it is blank on 472 of
 * 473 rows. Resolving to one column lost the date on nearly every application.
 * The reader walks the list and takes the first cell that actually has a value.
 */
export type FieldMap = Record<TrackingField, number[]>;

/**
 * Resolve a tab's header row to column indexes.
 *
 * A field claims the first header that matches one of its aliases, scanning
 * aliases in order. A column already claimed by an earlier field is not
 * reclaimed — on the Closer EOD tab "Closer Name" is both the person's name and
 * the rep, and letting both fields take it would be right, but two DIFFERENT
 * fields must never fight over one column and silently swap meaning.
 */
export function mapFields(headers: string[]): FieldMap {
  const clean = headers.map(normalizeHeading);
  const map = {} as FieldMap;
  const taken = new Set<number>();

  for (const field of TRACKING_FIELDS) {
    const candidates: number[] = [];
    for (const alias of ALIASES[field]) {
      clean.forEach((header, i) => {
        if (header === alias && !taken.has(i) && !candidates.includes(i)) {
          candidates.push(i);
        }
      });
    }
    // Claiming is still exclusive: a column belongs to ONE field, so two
    // fields can never quietly swap meaning on a sheet that names things oddly.
    candidates.forEach((i) => taken.add(i));
    map[field] = candidates;
  }
  return map;
}
