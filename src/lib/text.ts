/**
 * Small text helpers for copy that names a client.
 *
 * Client names are data, not constants — "Racks Closes" ends in an s and
 * "The Vault" does not, so any sentence that says "<client>'s account" needs
 * the possessive formed rather than concatenated.
 */

/** "The Vault" -> "The Vault's" · "Racks Closes" -> "Racks Closes'" */
export function possessive(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "";
  return /s$/i.test(trimmed) ? `${trimmed}’` : `${trimmed}’s`;
}
