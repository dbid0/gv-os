/**
 * UTM extraction from a form platform's response payload.
 *
 * Typeform carries hidden fields as `response.hidden` — a flat string map the
 * public link filled in (`?utm_source=instagram&…` → `{utm_source:
 * "instagram"}`). The GV standard (sops/UTM-LINKS.md) is all-lowercase with
 * dashes, so values are trimmed and lowercased on the way in — the same
 * traffic must always tag the same way regardless of how the link was typed.
 * A missing hidden block, a missing key, or an empty value is null: an
 * untagged link is a fact worth keeping, not a blank to fill.
 */

export type ExtractedUtms = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
};

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

function cleanValue(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  // Placeholder junk some builders emit when the variable never resolved.
  if (!t || t === "xxxxx" || t.startsWith("{{") || t.startsWith("{")) return null;
  return t.slice(0, 200);
}

export function extractUtms(raw: unknown): ExtractedUtms {
  const out: ExtractedUtms = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
  };
  if (!raw || typeof raw !== "object") return out;
  const hidden = (raw as Record<string, unknown>).hidden;
  if (!hidden || typeof hidden !== "object") return out;

  // Case-insensitive key match: builders disagree about UTM_Source vs
  // utm_source, and the tag must not be lost to casing.
  const entries = new Map(
    Object.entries(hidden as Record<string, unknown>).map(([k, v]) => [
      k.trim().toLowerCase(),
      v,
    ]),
  );
  const [source, medium, campaign, content] = KEYS.map((k) =>
    cleanValue(entries.get(k)),
  );
  out.utmSource = source;
  out.utmMedium = medium;
  out.utmCampaign = campaign;
  out.utmContent = content;
  return out;
}
