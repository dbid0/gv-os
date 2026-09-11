/**
 * The GV UTM standard — encoded so a link literally cannot be born malformed.
 *
 * Source of truth for the rule set: sops/UTM-LINKS.md in the ops workspace
 * (not this repo). Four params, always the same role, always lowercase,
 * always dash-separated:
 *
 *   utm_source   — the platform (youtube, instagram, tiktok, email…)
 *   utm_medium   — the placement on that platform (bio, description, story…)
 *   utm_campaign — the creator/account it lives on
 *   utm_content  — the specific asset, 1-3 words
 *
 * This is the ONE place those four keys and the normalizer live — the
 * inbound attribution reader (lib/docs/utm-extract.ts) is a separate,
 * narrower concern (trusting whatever a form platform already sent) and is
 * deliberately not merged with this, which is the OUTBOUND generator.
 */

export const UTM_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

export type UtmFields = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
};

const FIELD_ORDER: (keyof UtmFields)[] = ["source", "medium", "campaign", "content"];

/**
 * Normalizes one UTM value: lowercase, every run of non-alphanumeric
 * characters (spaces, underscores, punctuation, unicode symbols) collapsed to
 * a single dash, leading/trailing dashes trimmed.
 *
 * Deliberately permissive on INPUT (anyone can type "Day In Life" or
 * "day_in_life") and strict on OUTPUT (always "day-in-life") — the whole
 * point is that the value born from the builder can never violate the
 * standard, regardless of how it was typed. Idempotent: normalizing an
 * already-normalized value is a no-op.
 */
export function normalizeUtmValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type BuildUtmInput = {
  destinationUrl: string;
} & UtmFields;

/** The failure half of {@link BuildUtmResult} — shared so callers that wrap
 * the builder (the registry's save step) can reuse the exact same union
 * instead of re-declaring an equivalent one that could drift out of sync. */
export type BuildUtmFailure =
  | { ok: false; reason: "empty_destination" }
  | { ok: false; reason: "invalid_destination" }
  | { ok: false; reason: "empty_param"; field: keyof UtmFields };

export type BuildUtmResult =
  { ok: true; url: string; params: UtmFields } | BuildUtmFailure;

/**
 * The builder. Takes a destination link + the four raw field values (in
 * whatever casing/spacing a person typed) and returns either the assembled,
 * standard-compliant URL or why it couldn't be built.
 *
 * - The destination must be an absolute http(s) URL. Anything else — a bare
 *   domain with no scheme, a non-http(s) scheme like `javascript:`, empty
 *   input — is rejected rather than guessed at, so a link is never silently
 *   wrong about where it points.
 * - Every field is normalized before use; a field that normalizes to empty
 *   (e.g. raw input was only punctuation) fails closed rather than emitting
 *   a blank `utm_content=`.
 * - Existing query params on the destination are preserved. Existing
 *   `utm_*` keys on the destination are OVERWRITTEN (not duplicated) by the
 *   ones this call computes, which is what makes re-running the builder on
 *   its own output idempotent.
 */
export function buildUtmUrl(input: BuildUtmInput): BuildUtmResult {
  const destinationRaw = input.destinationUrl.trim();
  if (!destinationRaw) return { ok: false, reason: "empty_destination" };

  let url: URL;
  try {
    url = new URL(destinationRaw);
  } catch {
    return { ok: false, reason: "invalid_destination" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid_destination" };
  }

  const params: UtmFields = {
    source: normalizeUtmValue(input.source),
    medium: normalizeUtmValue(input.medium),
    campaign: normalizeUtmValue(input.campaign),
    content: normalizeUtmValue(input.content),
  };
  for (const field of FIELD_ORDER) {
    if (!params[field]) return { ok: false, reason: "empty_param", field };
  }

  url.searchParams.set("utm_source", params.source);
  url.searchParams.set("utm_medium", params.medium);
  url.searchParams.set("utm_campaign", params.campaign);
  url.searchParams.set("utm_content", params.content);

  return { ok: true, url: url.toString(), params };
}

/** A human line for a failed build — the UI's default error message. */
export function describeBuildFailure(result: BuildUtmFailure): string {
  if (result.reason === "empty_destination") return "Enter a destination link.";
  if (result.reason === "invalid_destination")
    return "That destination isn't a valid link — include https:// and a full URL.";
  const label: Record<keyof UtmFields, string> = {
    source: "Source",
    medium: "Medium",
    campaign: "Campaign",
    content: "Content",
  };
  return `${label[result.field]} is required.`;
}
