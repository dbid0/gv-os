import { describe, expect, it } from "vitest";

import {
  parseKitAccount,
  parseKitSequences,
  parseKitTagCount,
} from "@/lib/email/kit-parse";

describe("parseKitSequences", () => {
  it("extracts id/name/hold and drops malformed entries", () => {
    const out = parseKitSequences({
      sequences: [
        { id: 2835307, name: "The Grid — Welcome", hold: false },
        { id: "2835308", name: "Booked Call" },
        { id: "not-a-number", name: "broken" },
        "garbage",
      ],
    });
    expect(out).toEqual([
      { id: 2835307, name: "The Grid — Welcome", hold: false },
      { id: 2835308, name: "Booked Call" },
    ]);
  });

  it("returns empty on missing or non-array bodies", () => {
    expect(parseKitSequences({})).toEqual([]);
    expect(parseKitSequences(null)).toEqual([]);
    expect(parseKitSequences({ sequences: "nope" })).toEqual([]);
  });

  it("names unnamed sequences visibly", () => {
    expect(parseKitSequences({ sequences: [{ id: 1 }] })[0].name).toBe("(unnamed)");
  });
});

describe("parseKitTagCount", () => {
  it("counts tags and tolerates junk", () => {
    expect(parseKitTagCount({ tags: [{ id: 1 }, { id: 2 }, "x"] })).toBe(2);
    expect(parseKitTagCount({})).toBe(0);
  });
});

describe("parseKitAccount", () => {
  it("reads nested and flat account shapes", () => {
    expect(
      parseKitAccount({ account: { name: "The Grid", plan_type: "creator" } }),
    ).toEqual({ name: "The Grid", plan: "creator" });
    expect(parseKitAccount({ name: "Flat", plan: "free" })).toEqual({
      name: "Flat",
      plan: "free",
    });
    expect(parseKitAccount({})).toEqual({ name: null, plan: null });
  });
});
