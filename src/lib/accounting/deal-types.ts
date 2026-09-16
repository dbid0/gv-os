/**
 * DEAL TYPES — one vocabulary, defined once.
 *
 * There were three competing lists: the engine's, the deal form's own inline
 * array, and whatever the finance sheet had been typed with over a year. They
 * disagreed on the same deal ("Rev Share" vs "Rev-Share", "Setup Fee" vs
 * "Setup", a "One-off" that existed only in the form), so a deal logged in the
 * app landed under a label the engine did not group, and the totals quietly
 * split across near-duplicates.
 *
 * So: `DEAL_TYPES` is the list, and everything — the form's options, the
 * engine, any grouping — reads it from here. Nothing hardcodes its own copy.
 *
 * `canonicalDealType` maps the historical spellings onto it. Old rows keep the
 * text they were typed with (the archive is frozen and we do not rewrite
 * history), but they GROUP as the right type, which is what the money reads
 * depend on.
 */

export const DEAL_TYPES = [
  "Setup",
  "DWY Build",
  "DFY Build",
  "Retainer",
  "Rev-Share",
  "Client Handoff",
  "Consulting",
  "Other",
] as const;

export type DealType = (typeof DEAL_TYPES)[number];

export const DEFAULT_DEAL_TYPE: DealType = "Setup";

/**
 * Every spelling seen in the finance sheet or written by an older form,
 * lowercased, mapped to the type it actually means.
 *
 * Judgement calls, stated out loud so they can be argued with:
 * - "Setup Fee" IS "Setup" — the sheet used both for the same thing.
 * - "Rev-Share Payment" is a Rev-Share: a payout arriving is still rev-share
 *   money, and splitting them made the rev-share total read low.
 * - "DFY + Setup Payment" files under "DFY Build". The setup is part of the
 *   build deal; it is not a separate kind of deal.
 * - "One-off" only ever existed as a form option and means nothing specific,
 *   so it lands in "Other" rather than inventing a category for it.
 */
const ALIASES: Record<string, DealType> = {
  "setup fee": "Setup",
  setup: "Setup",
  "rev share": "Rev-Share",
  "rev-share": "Rev-Share",
  revshare: "Rev-Share",
  "rev share payment": "Rev-Share",
  "rev-share payment": "Rev-Share",
  "dfy build": "DFY Build",
  "dfy + setup payment": "DFY Build",
  "dfy+setup payment": "DFY Build",
  "dfy setup payment": "DFY Build",
  "dwy build": "DWY Build",
  dwy: "DWY Build",
  "client handoff": "Client Handoff",
  handoff: "Client Handoff",
  retainer: "Retainer",
  consulting: "Consulting",
  "one-off": "Other",
  "one off": "Other",
  other: "Other",
};

/**
 * The canonical type for a label as typed. Unknown text falls back to "Other"
 * rather than throwing — a deal from 2026 must never break a page in 2027 —
 * but `isKnownDealType` lets a surface show that it was not recognised instead
 * of silently swallowing it.
 */
export function canonicalDealType(raw: string | null | undefined): DealType {
  if (!raw) return "Other";
  return ALIASES[raw.trim().toLowerCase()] ?? "Other";
}

/** False when the label matched nothing and was only defaulted to "Other". */
export function isKnownDealType(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.trim().toLowerCase() in ALIASES;
}
