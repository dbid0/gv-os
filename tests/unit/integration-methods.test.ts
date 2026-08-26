import { describe, expect, it } from "vitest";

import {
  PROVIDERS,
  defaultMethod,
  methodsForProvider,
  providerByValue,
  providerSupportsMethod,
  providerSyncStatus,
} from "@/lib/integrations/providers";

const p = (value: string) => {
  const provider = providerByValue(value);
  if (!provider) throw new Error(`unknown provider ${value}`);
  return provider;
};

describe("connection methods", () => {
  it("offers webhook (best), api_key, and manual for payments/bookings tools", () => {
    for (const value of ["stripe", "whop", "calendly", "typeform"]) {
      expect(methodsForProvider(p(value))).toEqual(["webhook", "api_key", "manual"]);
      expect(defaultMethod(p(value))).toBe("webhook");
    }
  });

  it("offers api_key (best) and manual for everything else", () => {
    for (const value of ["close", "kit", "slack", "notion", "mcp"]) {
      expect(methodsForProvider(p(value))).toEqual(["api_key", "manual"]);
      expect(defaultMethod(p(value))).toBe("api_key");
    }
  });

  it("never offers webhook to a non-webhook tool", () => {
    expect(providerSupportsMethod(p("kit"), "webhook")).toBe(false);
    expect(providerSupportsMethod(p("stripe"), "webhook")).toBe(true);
  });

  it("offers manual on every provider as the universal fallback", () => {
    for (const value of ["stripe", "close", "mcp", "typeform"]) {
      expect(providerSupportsMethod(p(value), "manual")).toBe(true);
    }
  });
});

describe("providerSyncStatus", () => {
  it("marks the tools with a live pull engine as auto-syncing", () => {
    for (const value of [
      "kit",
      "close",
      "calendly",
      "typeform",
      "pandadoc",
      "stripe",
      "google_sheets",
    ]) {
      expect(providerSyncStatus(value)).toBe("auto");
    }
  });

  it("marks push-only payment/booking tools as webhook", () => {
    for (const value of ["whop", "fanbasis", "shopify", "commas", "iclosed"]) {
      expect(providerSyncStatus(value)).toBe("webhook");
    }
  });

  it("honestly marks the tools with no ingestion as no-sync", () => {
    for (const value of [
      "manychat",
      "vidalytics",
      "wistia",
      "slack",
      "notion",
      "mcp",
    ]) {
      expect(providerSyncStatus(value)).toBe("none");
    }
  });

  it("classifies every catalog provider into one of the three states", () => {
    for (const prov of PROVIDERS) {
      expect(["auto", "webhook", "none"]).toContain(providerSyncStatus(prov.value));
    }
  });
});
