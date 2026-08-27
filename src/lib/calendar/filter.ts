/**
 * Keeps the Calendar about REAL work — client and team tasks, calls, events —
 * and off the internal "update the Global Ventures software" chatter.
 *
 * The agency morning call is recorded and distilled into `action_items`, so
 * every "ship the calendar rework", "merge that PR", "fix the CI" that Daniel
 * and the operator talk through while BUILDING GV OS lands on the board too.
 * Those belong on the dev backlog, not on the calendar the team runs their week
 * from. There is no `type` column to separate them, so we read the words: a
 * curated set of unmistakable software-development signals, matched with word
 * boundaries so real GV work ("Update the offer's tracking sheet", "QA the
 * application form") never trips them.
 *
 * Conservative on purpose — when in doubt an item stays visible. Missing one
 * dev task is cheaper than hiding a real client deliverable.
 */

/** Unmistakable software-dev signals. All matched case-insensitively. */
const DEV_SIGNALS: RegExp[] = [
  /\bgv[\s-]?os\b/, // GV OS, gv-os, gvos
  /\bglobal ventures software\b/,
  /\bpull request\b/,
  /\bpr\s?#\s?\d+/, // PR #221
  /\bmerge\b/,
  /\bhotfix\b/,
  /\bcommit(s|ted|ting)?\b/,
  /\brefactor/,
  /\bcodebase\b/,
  /\bdeploy(s|ed|ing|ment)?\b/,
  /\bvercel\b/,
  /\bsupabase\b/,
  /\bdrizzle\b/,
  /\bpostgres\b/,
  /\btypecheck\b/,
  /\beslint\b/,
  /\blint(er|ing)?\b/,
  /\bprettier\b/,
  /\bvitest\b/,
  /\bunit tests?\b/,
  /\bregression\b/,
  /\bschema\b/,
  /\bmigration\b/,
  /\bendpoint\b/,
  /\bapi\s+(route|endpoint)\b/,
  /\bbugs?\b/,
  /\bnext\.?js\b/,
  /\btailwind\b/,
  /\bgithub\b/,
  /\bthe (app|software|dashboard|portal|codebase)\b/,
];

/**
 * True when an item reads as internal GV OS / software-dev work and should be
 * hidden from the calendar. Looks at the title and any origin notes together.
 */
export function isSoftwareDevItem(item: {
  title: string;
  notes?: string | null;
}): boolean {
  const haystack = `${item.title} ${item.notes ?? ""}`.toLowerCase();
  return DEV_SIGNALS.some((re) => re.test(haystack));
}
