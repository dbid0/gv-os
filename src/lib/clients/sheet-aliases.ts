/**
 * Sheet-name → client matching, pure. The Master Finance Sheet records deals
 * under human names (a creator's name, sometimes with a note); this table
 * maps them to roster slugs. Substring match, case-insensitive, aliases
 * maintained here as the sheet's vocabulary grows.
 *
 * Offers retired in September 2026 had their aliases removed with them, so a
 * historical sheet row naming one no longer attributes to a client the app
 * does not carry —
 * it simply stays unattributed, which is the honest answer for an offer GV
 * no longer runs. Unmatched rows simply don't appear in a client report —
 * the full set always lives on the reconciliation screen.
 */

const ALIASES: Record<string, string[]> = {
  "the-grid": ["kaden"],
};

export function matchesSheetClient(slug: string, sheetClient: string): boolean {
  const needles = ALIASES[slug];
  if (!needles) return false;
  const hay = sheetClient.toLowerCase();
  return needles.some((n) => hay.includes(n));
}
