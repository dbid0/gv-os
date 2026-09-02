import { matchesSheetClient } from "@/lib/clients/sheet-aliases";

/**
 * WHOSE MONEY IS THIS ROW?
 *
 * The client workspace used to answer this by comparing DISPLAY NAMES —
 * `row.clientName === client.name`. Two client records may carry the same
 * name (staging holds two "The Grid" rows today, and nothing in the schema
 * prevents it in production), so that comparison pulled another record's
 * deals into this client's totals: of the eight rows the workspace listed for
 * The Grid, five belonged to a different client entirely.
 *
 * Money is attributed by client ID. A name is a label people edit; an id is
 * the row's actual owner, and renaming a client must never move its cash.
 *
 * The sheet-alias fallback stays, and only for rows with NO client join: an
 * imported Master-Finance-Sheet line has a description instead of a foreign
 * key, and that path already keys off the slug rather than the name.
 */
export interface AttributableRow {
  /** The joined client, when the row carries the foreign key. */
  clientId: string | null;
  /** Free text from an imported sheet row; the only alias-matching input. */
  description: string | null;
}

export function belongsToClient(
  row: AttributableRow,
  clientId: string | null,
  slug: string,
): boolean {
  // A joined row is owned by exactly one client — decided, never guessed.
  if (row.clientId !== null) {
    return clientId !== null && row.clientId === clientId;
  }
  // Unjoined sheet import: fall back to the slug's aliases, not the name.
  return row.description !== null && matchesSheetClient(slug, row.description);
}

/** The rows belonging to this client, in the order given. */
export function rowsForClient<T extends AttributableRow>(
  rows: T[],
  clientId: string | null,
  slug: string,
): T[] {
  return rows.filter((r) => belongsToClient(r, clientId, slug));
}
