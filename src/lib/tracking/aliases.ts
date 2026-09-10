/**
 * Email identity resolution — one person, several inboxes.
 *
 * People pay under a different email than they booked with. An alias map
 * says which emails are the same person; every identity join (cash-mix payer
 * keys, speed-to-lead matching) resolves through it before comparing.
 *
 * Resolution is ONE hop, by design: alias → canonical, never chained. If a
 * canonical is itself listed as an alias elsewhere, that second mapping is
 * NOT followed — chains make identity depend on insertion order, and one
 * wrong merge should damage exactly one link, not everything transitively
 * attached to it. Cycles are therefore impossible to follow by construction.
 */

export type AliasRow = { aliasEmail: string; canonicalEmail: string };

export type AliasMap = Map<string, string>;

const norm = (e: string) => e.trim().toLowerCase();

/** Build the lookup, normalized. Later duplicates of the same alias lose. */
export function buildAliasMap(rows: AliasRow[]): AliasMap {
  const map: AliasMap = new Map();
  for (const row of rows) {
    const alias = norm(row.aliasEmail);
    const canonical = norm(row.canonicalEmail);
    if (!alias || !canonical || alias === canonical) continue;
    if (!map.has(alias)) map.set(alias, canonical);
  }
  return map;
}

export const EMPTY_ALIASES: AliasMap = new Map();

/** Resolve one email to its canonical identity — one hop, never a chain. */
export function resolveEmail(
  email: string | null | undefined,
  aliases: AliasMap,
): string | null {
  if (!email) return null;
  const e = norm(email);
  if (!e) return null;
  return aliases.get(e) ?? e;
}
