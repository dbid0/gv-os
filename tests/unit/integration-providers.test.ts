import { describe, expect, it } from "vitest";

import {
  CREDENTIAL_LABELS,
  PROVIDERS,
  PROVIDER_GROUPS,
  PROVIDER_VALUES,
  providerByValue,
} from "@/lib/integrations/providers";

describe("integration catalog", () => {
  it("covers every tool from Daniel's brief", () => {
    for (const tool of [
      "close",
      "iclosed",
      "calendly",
      "typeform",
      "kit",
      "manychat",
      "pandadoc",
      "slack",
      "discord",
      "whop",
      "fanbasis",
      "stripe",
      "shopify",
      "vidalytics",
      "wistia",
      "google_drive",
      "notion",
      "mcp",
    ]) {
      expect(PROVIDER_VALUES).toContain(tool);
    }
  });

  it("has no duplicate values", () => {
    expect(new Set(PROVIDER_VALUES).size).toBe(PROVIDERS.length);
  });

  it("puts every provider in a known group", () => {
    for (const p of PROVIDERS) {
      expect(PROVIDER_GROUPS).toContain(p.group as (typeof PROVIDER_GROUPS)[number]);
    }
  });

  it("labels every credential kind used", () => {
    for (const p of PROVIDERS) {
      expect(CREDENTIAL_LABELS[p.credential]).toBeTruthy();
    }
  });

  it("looks up providers by value and misses safely", () => {
    expect(providerByValue("close")?.label).toBe("Close CRM");
    expect(providerByValue("nonexistent")).toBeUndefined();
  });
});
