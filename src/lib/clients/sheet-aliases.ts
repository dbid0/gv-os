/**
 * Sheet-name → client matching, pure. The Master Finance Sheet records deals
 * under human names ("Kaden (AI)", "Brady Stein", "Aiden Racks"); this table
 * maps them to roster slugs. Substring match, case-insensitive, aliases
 * maintained here as the sheet's vocabulary grows.
 *
 * The Vault, Racks Closes, and The Visionary were retired in September 2026.
 * Their aliases are gone with them, so a historical sheet row naming Brady,
 * Aiden, or Tico no longer attributes to a client the app does not carry —
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
