import { describe, expect, it } from "vitest";

import {
  STARTER_MEDIUMS,
  STARTER_SOURCES,
  utmSuggestions,
  type RememberedLink,
} from "@/lib/marketing/utm-values";

const day = (d: number) => new Date(Date.UTC(2026, 8, d));

function link(extra: Partial<RememberedLink>): RememberedLink {
  return {
    clientId: "a",
    destinationUrl: "https://a.example/apply",
    utmSource: "youtube",
    utmMedium: "description",
    utmCampaign: "main",
    createdAt: day(1),
    ...extra,
  };
}

describe("utmSuggestions", () => {
  it("starts from the starter lists with an empty registry", () => {
    expect(utmSuggestions([], "a")).toEqual({
      source: STARTER_SOURCES,
      medium: STARTER_MEDIUMS,
      campaign: [],
      destination: [],
    });
  });

  it("puts this client's values first, then other clients', then unused starters", () => {
    const s = utmSuggestions(
      [
        link({ clientId: "b", utmSource: "x-twitter" }),
        link({ clientId: "b", utmSource: "x-twitter" }),
        link({ clientId: "b", utmSource: "x-twitter" }),
        link({ clientId: "a", utmSource: "newsletter" }),
        link({ clientId: "a", utmSource: "youtube" }),
        link({ clientId: "a", utmSource: "youtube" }),
      ],
      "a",
    );
    expect(s.source).toEqual([
      "youtube",
      "newsletter",
      "x-twitter",
      "instagram",
      "tiktok",
      "email",
      "discord",
    ]);
  });

  it("breaks ties on the most recent use, then alphabetically; skips blanks", () => {
    const s = utmSuggestions(
      [
        link({ utmCampaign: "older", createdAt: day(1) }),
        link({ utmCampaign: "newer", createdAt: day(5) }),
        link({ utmCampaign: "beta", createdAt: day(3) }),
        link({ utmCampaign: "alpha", createdAt: day(3) }),
        link({ utmCampaign: "  " }),
      ],
      "a",
    );
    expect(s.campaign).toEqual(["newer", "alpha", "beta", "older"]);
  });

  it("only suggests the selected client's own destinations", () => {
    const s = utmSuggestions(
      [
        link({ clientId: "b", destinationUrl: "https://b.example/apply" }),
        link({ destinationUrl: "https://a.example/vsl" }),
        link({ destinationUrl: "https://a.example/vsl" }),
        link({}),
      ],
      "a",
    );
    expect(s.destination).toEqual(["https://a.example/vsl", "https://a.example/apply"]);
    expect(utmSuggestions([link({})], "c").destination).toEqual([]);
  });
});
