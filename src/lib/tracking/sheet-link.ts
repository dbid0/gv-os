/**
 * Guarding the link between an offer and its tracking sheet.
 *
 * One sheet feeds one offer's entire workspace — its funnel, its leads, its
 * call reviews. Pointing two offers at the same sheet would show one client's
 * prospects, deals and recordings inside another client's workspace, and
 * nothing on screen would look wrong: the numbers would simply be somebody
 * else's. That is the single worst thing this mirror can do, so it is checked
 * before the id is ever saved rather than noticed afterwards.
 *
 * Pure so the check can be tested without a database.
 */

export interface SheetOwner {
  clientId: string;
  slug: string;
  name: string;
  trackingSheetId: string | null;
}

/**
 * Extract a spreadsheet id from whatever was pasted.
 *
 * People paste the whole URL as often as the id. Accepting both means the id
 * that gets stored is the id, not a URL that silently fails every sync.
 */
export function normalizeSheetId(input: string): string {
  const raw = input.trim();
  if (raw === "") return "";
  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(raw);
  return (fromUrl ? fromUrl[1] : raw).trim();
}

/**
 * The other offer already using this sheet, if any.
 *
 * Re-saving the SAME id on the SAME offer is not a conflict — that is just
 * someone pressing save twice.
 */
export function conflictingOwner(
  sheetId: string,
  clientId: string,
  owners: SheetOwner[],
): SheetOwner | null {
  const id = normalizeSheetId(sheetId);
  if (id === "") return null;
  return (
    owners.find((o) => o.trackingSheetId === id && o.clientId !== clientId) ?? null
  );
}

/** A Google Sheet id, as it appears in the URL after /d/. */
export function looksLikeSheetId(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,}$/.test(value);
}
