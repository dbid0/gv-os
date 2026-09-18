import { describe, expect, it } from "vitest";

import {
  parseKitAccount,
  parseKitSequences,
  parseKitSubscriberTotal,
  parseKitTagCount,
} from "@/lib/email/kit-parse";

describe("parseKitSequences", () => {
  it("extracts id/name/hold and drops malformed entries", () => {
    const out = parseKitSequences({
      sequences: [
        { id: 2835307, name: "Client North — Welcome", hold: false },
        { id: "2835308", name: "Booked Call" },
        { id: "not-a-number", name: "broken" },
        "garbage",
      ],
    });
    expect(out).toEqual([
      { id: 2835307, name: "Client North — Welcome", hold: false },
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
      parseKitAccount({ account: { name: "Client North", plan_type: "creator" } }),
    ).toEqual({ name: "Client North", plan: "creator" });
    expect(parseKitAccount({ name: "Flat", plan: "free" })).toEqual({
      name: "Flat",
      plan: "free",
    });
    expect(parseKitAccount({})).toEqual({ name: null, plan: null });
  });
});

describe("parseKitSubscriberTotal", () => {
  it("reads pagination.total_count", () => {
    expect(
      parseKitSubscriberTotal({ subscribers: [], pagination: { total_count: 330 } }),
    ).toBe(330);
    expect(parseKitSubscriberTotal({ pagination: { total_count: 0 } })).toBe(0);
  });

  it("returns null — never a fake zero — when the count is missing or junk", () => {
    expect(parseKitSubscriberTotal({})).toBeNull();
    expect(parseKitSubscriberTotal(null)).toBeNull();
    expect(parseKitSubscriberTotal({ pagination: {} })).toBeNull();
    expect(parseKitSubscriberTotal({ pagination: { total_count: "330" } })).toBeNull();
    expect(parseKitSubscriberTotal({ pagination: { total_count: -1 } })).toBeNull();
    expect(parseKitSubscriberTotal({ pagination: { total_count: NaN } })).toBeNull();
  });
});

describe("parseKitSequences — a sequence's weight", () => {
  it("keeps the email and subscriber counts Kit reports", () => {
    // Without these a sequence is a name and a pill, and "47 emails to 153
    // people" reads as one more row.
    const out = parseKitSequences({
      sequences: [
        { id: 1, name: "Forever Nurture", email_count: 47, subscriber_count: 153 },
      ],
    });
    expect(out[0]).toMatchObject({ emailCount: 47, subscriberCount: 153 });
  });

  it("leaves a count Kit did not report absent, never zero", () => {
    const out = parseKitSequences({ sequences: [{ id: 1, name: "Bare" }] });
    expect(out[0]).not.toHaveProperty("emailCount");
    expect(out[0]).not.toHaveProperty("subscriberCount");
  });

  it("keeps a real zero", () => {
    const out = parseKitSequences({
      sequences: [{ id: 1, name: "Empty", email_count: 0, subscriber_count: 0 }],
    });
    expect(out[0]).toMatchObject({ emailCount: 0, subscriberCount: 0 });
  });

  it("rejects a count that is not a usable number", () => {
    for (const bad of ["12", -1, null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = parseKitSequences({
        sequences: [{ id: 1, name: "Odd", email_count: bad }],
      });
      expect(out[0]).not.toHaveProperty("emailCount");
    }
  });
});
