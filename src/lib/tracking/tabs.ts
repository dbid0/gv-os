/**
 * READING A CLIENT'S MASTER TRACKING SHEET.
 *
 * Every GV client runs the same tracking sheet — Applications, Calls Log,
 * Payment Log, New Deals, AR, the BOD/EOD forms, and EOC (end-of-call)
 * reports. The TABS are standard. The COLUMNS are not:
 *
 *   The Grid   Applications: "Social Handle | Q1: Type | Q2: Reach | Q5: Budget"
 *   Racks      Applications: "Handle / Social | Qualifier 1 | Budget / Capital"
 *   The Grid   Calls Log:    "… | iClosed Booking | Close Lead ID | …"
 *   Racks      Calls Log:    "… | Calendly Event  | Close Lead ID | …"
 *
 * and Racks has no BOD or DM Setter EOD tab at all. Reading these by column
 * POSITION would file Racks' budget answers under The Grid's "reach" and never
 * once look wrong on screen. So every field is resolved by HEADER NAME through
 * an alias list, a column that cannot be resolved is left null rather than
 * guessed, and an absent tab is simply absent.
 *
 * Nothing here touches money. Cash and revenue columns are mirrored as
 * TRACKING figures for funnel metrics; the ledger remains the only place a
 * dollar is ever recorded, and `import-new-deals` remains the only writer of
 * client cash. If the two disagree, that is a drift to show, never a number to
 * silently pick between.
 */

/** The canonical tabs, independent of the emoji and wording each sheet uses. */
export const TRACKING_TABS = [
  "applications",
  "calls",
  "payments",
  "deals",
  "ar",
  "bod",
  "setter_eod",
  "dm_setter_eod",
  "closer_eod",
  "eoc",
] as const;

export type TrackingTab = (typeof TRACKING_TABS)[number];

/**
 * Tab title → canonical tab. Titles carry emoji and spacing that vary between
 * sheets ("📝 EOC Reports", "📊 Closer EOD"), so matching is done on the
 * letters alone.
 */
const TAB_PATTERNS: ReadonlyArray<[TrackingTab, RegExp]> = [
  ["applications", /^applications?$/],
  ["calls", /^calls?\s*log$/],
  ["payments", /^payments?\s*log$/],
  ["deals", /^new\s*deals?$/],
  ["ar", /^(accounts\s*receivable|ar)$/],
  ["bod", /^bod$/],
  // The DM variant must be tested BEFORE the plain setter tab, or "DM Setter
  // EOD" would match the setter pattern first and both would land in one bucket.
  ["dm_setter_eod", /^dm\s*setter\s*eod$/],
  ["setter_eod", /^setter\s*eod$/],
  ["closer_eod", /^closer\s*eod$/],
  ["eoc", /^eoc(\s*reports?)?$/],
];

/** Strip emoji/punctuation and collapse whitespace, keeping letters and digits. */
export function normalizeHeading(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s/'’&:.+#-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The canonical tab for a sheet tab title, or null when it isn't one we read. */
export function tabFromTitle(title: string): TrackingTab | null {
  const clean = normalizeHeading(title);
  for (const [tab, pattern] of TAB_PATTERNS) {
    if (pattern.test(clean)) return tab;
  }
  return null;
}
