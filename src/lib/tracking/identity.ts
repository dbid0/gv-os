/**
 * SAME PERSON, OTHER INBOXES — the rules for merging identities.
 *
 * The alias layer (lib/tracking/aliases) resolves one hop: alias → canonical.
 * This module decides which merges are allowed so that rule can never be
 * broken from the UI, lists a person's inboxes, and rewrites lead rows onto
 * their canonical email so every view counts one person once.
 *
 * Refusals, each a sentence the admin can act on:
 * - an email merged into itself, or a malformed email;
 * - an inbox already merged into someone (unmerge it first);
 * - an inbox that other inboxes are already merged INTO (it is a person, not
 *   an alias — merging it would silently orphan them, since resolution never
 *   follows a chain);
 * - a target that is itself merged into someone else (merge into that person).
 *
 * Merges are reversible: unmerging deletes one link and nothing else.
 *
 * Pure: no database.
 */

import { resolveEmail, type AliasMap } from "@/lib/tracking/aliases";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (e: string) => e.trim().toLowerCase();

export type MergeVerdict =
  { ok: true; alias: string; canonical: string } | { ok: false; reason: string };

export function validateMerge(input: {
  alias: string;
  canonical: string;
  aliases: AliasMap;
}): MergeVerdict {
  const alias = norm(input.alias);
  const canonical = norm(input.canonical);
  if (!EMAIL.test(alias)) {
    return { ok: false, reason: `"${input.alias.trim()}" isn't an email address.` };
  }
  if (!EMAIL.test(canonical)) {
    return { ok: false, reason: "This person's email isn't valid." };
  }
  if (alias === canonical) {
    return { ok: false, reason: "That's already this person's email." };
  }
  const existing = input.aliases.get(alias);
  if (existing !== undefined) {
    return {
      ok: false,
      reason:
        existing === canonical
          ? `${alias} is already merged into this person.`
          : `${alias} is already merged into ${existing}. Unmerge it there first.`,
    };
  }
  if ([...input.aliases.values()].includes(alias)) {
    return {
      ok: false,
      reason: `Other inboxes are merged into ${alias}, so it's a person of its own. Open ${alias} and merge this person into it instead.`,
    };
  }
  const canonicalTarget = input.aliases.get(canonical);
  if (canonicalTarget !== undefined) {
    return {
      ok: false,
      reason: `This inbox is itself merged into ${canonicalTarget}. Merge ${alias} into ${canonicalTarget} instead.`,
    };
  }
  return { ok: true, alias, canonical };
}

/** Every inbox that is this person: the canonical email first, then its aliases. */
export function inboxesFor(email: string, aliases: AliasMap): string[] {
  const canonical = resolveEmail(email, aliases) ?? norm(email);
  const inboxes = [canonical];
  for (const [alias, target] of aliases) {
    if (target === canonical && !inboxes.includes(alias)) inboxes.push(alias);
  }
  return inboxes;
}

/**
 * Lead rows keyed under their person's canonical email, so the lead builder
 * makes one journey per person. Rows without an email pass through. With no
 * aliases the input array itself is returned.
 */
export function resolveLeadRows<R extends { email: string | null }>(
  rows: R[],
  aliases: AliasMap,
): R[] {
  if (aliases.size === 0) return rows;
  return rows.map((r) => {
    if (!r.email) return r;
    const canonical = resolveEmail(r.email, aliases);
    return canonical === r.email ? r : { ...r, email: canonical };
  });
}

export type MergeCandidate = {
  email: string;
  sharedPhone: boolean;
  sharedName: boolean;
};

/**
 * "Possibly the same person" suggestions: other inboxes sharing this person's
 * phone or full name, strongest first (both, then phone, then name), never an
 * inbox that is already this person or already merged elsewhere.
 */
export function rankMergeCandidates(
  candidates: MergeCandidate[],
  inboxes: string[],
  aliases: AliasMap,
  limit = 5,
): MergeCandidate[] {
  // One entry per email, with every signal any row gave it.
  const byEmail = new Map<string, MergeCandidate>();
  for (const c of candidates) {
    const email = norm(c.email);
    if (!EMAIL.test(email) || inboxes.includes(email) || aliases.has(email)) continue;
    const acc = byEmail.get(email) ?? { email, sharedPhone: false, sharedName: false };
    acc.sharedPhone ||= c.sharedPhone;
    acc.sharedName ||= c.sharedName;
    byEmail.set(email, acc);
  }
  const score = (c: MergeCandidate) => (c.sharedPhone ? 2 : 0) + (c.sharedName ? 1 : 0);
  return [...byEmail.values()]
    .filter((c) => c.sharedPhone || c.sharedName)
    .sort((a, b) => score(b) - score(a) || a.email.localeCompare(b.email))
    .slice(0, limit);
}

/** Phone digits for matching: the last ten, or null when too short to trust. */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}
