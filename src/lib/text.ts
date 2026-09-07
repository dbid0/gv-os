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

/**
 * A person's name as typed on a sheet, made presentable.
 *
 * Sheets carry "lorenzo saponara" and "Lorenzo Saponara" for the same person;
 * titles and tables should not echo the typo. Conservative on purpose: ONLY a
 * word that is entirely lowercase gets its first letter raised. Interior caps
 * (McArthur), initials (JD), and anything already cased are left exactly as
 * typed — guessing further would mangle real names.
 */
export function displayName(name: string): string {
  return name
    .split(/(\s+)/)
    .map((part) =>
      /^[a-z][a-z'’-]*$/.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part,
    )
    .join("");
}
