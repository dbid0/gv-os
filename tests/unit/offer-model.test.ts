import { describe, expect, it } from "vitest";

import {
  offerModelOf,
  runsCalls,
  stagesForModel,
  tabsForModel,
  usesTab,
} from "@/lib/clients/offer-model";

describe("offerModelOf", () => {
  it("defaults to high ticket, which is most of the book", () => {
    expect(offerModelOf(null)).toBe("high_ticket");
    expect(offerModelOf("")).toBe("high_ticket");
    expect(offerModelOf("something-else")).toBe("high_ticket");
  });

  it("reads a known model", () => {
    expect(offerModelOf("base44")).toBe("base44");
    expect(offerModelOf("high_ticket")).toBe("high_ticket");
  });
});

describe("what each offer tracks", () => {
  it("gives a high-ticket offer the whole funnel", () => {
    expect(usesTab("high_ticket", "calls")).toBe(true);
    expect(usesTab("high_ticket", "eoc")).toBe(true);
    expect(usesTab("high_ticket", "closer_eod")).toBe(true);
    expect(runsCalls("high_ticket")).toBe(true);
  });

  it("gives Base 44 the sale forms and nothing built around a call", () => {
    // Sold without a call ever happening — tracking is the new-sale forms.
    expect(usesTab("base44", "payments")).toBe(true);
    expect(usesTab("base44", "deals")).toBe(true);
    expect(usesTab("base44", "applications")).toBe(true);
    expect(usesTab("base44", "calls")).toBe(false);
    expect(usesTab("base44", "eoc")).toBe(false);
    expect(usesTab("base44", "closer_eod")).toBe(false);
    expect(runsCalls("base44")).toBe(false);
  });

  it("never lets a Base 44 offer claim a call surface", () => {
    for (const tab of [
      "calls",
      "eoc",
      "bod",
      "setter_eod",
      "dm_setter_eod",
      "closer_eod",
    ] as const) {
      expect(tabsForModel("base44")).not.toContain(tab);
    }
  });
});

describe("funnel stages", () => {
  it("drops booked and held from a Base 44 funnel", () => {
    // Showing them at zero would report a 0% show rate on an offer that never
    // books a call — a floor doing nothing, rather than a different business.
    expect(stagesForModel("base44")).toEqual(["applied", "closed", "paid"]);
    expect(stagesForModel("base44")).not.toContain("booked");
    expect(stagesForModel("base44")).not.toContain("held");
  });

  it("keeps the full path for high ticket", () => {
    expect(stagesForModel("high_ticket")).toEqual([
      "applied",
      "booked",
      "held",
      "closed",
      "paid",
    ]);
  });
});
