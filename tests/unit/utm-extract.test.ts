import { describe, expect, it } from "vitest";

import { extractUtms } from "@/lib/docs/utm-extract";

describe("extractUtms", () => {
  it("pulls the four UTM keys from the hidden block", () => {
    const raw = {
      hidden: {
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "main-offer",
        utm_content: "reel-42",
      },
    };
    expect(extractUtms(raw)).toEqual({
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "main-offer",
      utmContent: "reel-42",
    });
  });

  it("normalizes to the GV standard: trimmed, lowercase", () => {
    const raw = { hidden: { utm_source: "  Instagram ", UTM_Medium: "Social" } };
    const got = extractUtms(raw);
    expect(got.utmSource).toBe("instagram");
    expect(got.utmMedium).toBe("social");
  });

  it("no hidden block, missing keys, or empty values → nulls", () => {
    expect(extractUtms({})).toEqual({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
    });
    expect(extractUtms({ hidden: { utm_source: "" } }).utmSource).toBeNull();
    expect(extractUtms(null).utmSource).toBeNull();
    expect(extractUtms("junk").utmSource).toBeNull();
  });

  it("drops unresolved template placeholders rather than storing them", () => {
    const raw = { hidden: { utm_source: "{{campaign.source}}", utm_medium: "xxxxx" } };
    const got = extractUtms(raw);
    expect(got.utmSource).toBeNull();
    expect(got.utmMedium).toBeNull();
  });

  it("ignores non-string values and never throws", () => {
    const raw = { hidden: { utm_source: 42, utm_medium: { nested: true } } };
    expect(extractUtms(raw)).toEqual({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
    });
  });

  it("caps absurdly long values", () => {
    const raw = { hidden: { utm_source: "a".repeat(500) } };
    expect(extractUtms(raw).utmSource).toHaveLength(200);
  });
});
