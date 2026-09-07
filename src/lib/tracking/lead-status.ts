/**
 * READING A SHEET'S STATUS CELL.
 *
 * Free-text statuses ("succeeded", "no show", "dq", "closer follow up",
 * "Webinar Lead") carry real meaning but render as flat grey text. This maps
 * them onto a small set of tones so the leads table reads at a glance —
 * WITHOUT rewriting the words: the cell shows exactly what the sheet says,
 * only the colour is interpreted. Unknown wording stays neutral rather than
 * guessing.
 */

export type LeadStatusTone = "success" | "brand" | "warning" | "danger" | "neutral";

const PAID = /(succeed|paid|won|closed|purchase)/i;
const PROGRESS = /(follow.?up|booked|held|showed|scheduled|call set|webinar)/i;
const STALLED = /(no.?show|cancel|resched|no answer|missed|ghost)/i;
const DEAD = /(^dq$|disqual|refund|lost|dead|not qualified|unqualified)/i;

export function leadStatusTone(status: string | null | undefined): LeadStatusTone {
  const s = status?.trim() ?? "";
  if (s === "") return "neutral";
  if (PAID.test(s)) return "success";
  if (DEAD.test(s)) return "danger";
  if (STALLED.test(s)) return "warning";
  if (PROGRESS.test(s)) return "brand";
  return "neutral";
}
