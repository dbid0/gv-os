/**
 * Cash authority — the Money Spine's anti-double-count switch (spec §3).
 *
 * For one offer, exactly one kind of source owns the CASH: its payment
 * processors, or its new-deal form. Multiple processors on the same offer all
 * pool their cash regardless; this only decides whether the FORM *also*
 * contributes cash, so the same deal is never counted twice.
 *
 * Pure and total, so the money path can never hit an undefined state.
 */

export type CashAuthoritySetting = "auto" | "forms" | "processors";
export type CashAuthority = "forms" | "processors";

/** Narrow an arbitrary stored value to a valid setting; anything odd is `auto`. */
export function normalizeCashAuthority(value: unknown): CashAuthoritySetting {
  return value === "forms" || value === "processors" ? value : "auto";
}

/**
 * Resolve the effective cash authority for an offer.
 *
 * - `forms` / `processors` are honored exactly (Daniel's explicit override).
 * - `auto` (the default) derives it: the moment any processor source is
 *   connected the processors own the cash and the form becomes deals-only;
 *   until then the form is the only cash source. This preserves today's
 *   behavior while making the rule an explicit, overridable setting rather
 *   than a fragile inference buried in the importer.
 */
export function resolveCashAuthority(
  setting: CashAuthoritySetting,
  hasConnectedProcessor: boolean,
): CashAuthority {
  if (setting === "forms") return "forms";
  if (setting === "processors") return "processors";
  return hasConnectedProcessor ? "processors" : "forms";
}

/** True when the new-deal form should contribute cash (not just deals). */
export function formOwnsCash(
  setting: CashAuthoritySetting,
  hasConnectedProcessor: boolean,
): boolean {
  return resolveCashAuthority(setting, hasConnectedProcessor) === "forms";
}
