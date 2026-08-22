/**
 * Sheet-name → client matching, pure. The Master Finance Sheet records deals
 * under human names ("Kaden (AI)", "Brady Stein", "Aiden Racks"); this table
 * maps them to roster slugs. Substring match, case-insensitive, aliases
 * maintained here as the sheet's vocabulary grows. Unmatched rows simply
 * don't appear in a client report — the full set always lives on the
 * reconciliation screen.
 */

const ALIASES: Record<string, string[]> = {
  "the-grid": ["kaden"],
  "the-vault": ["brady"],
  "racks-closes": ["aiden racks", "racks"],
};

export function matchesSheetClient(slug: string, sheetClient: string): boolean {
  const needles = ALIASES[slug];
  if (!needles) return false;
  const hay = sheetClient.toLowerCase();
  return needles.some((n) => hay.includes(n));
}
