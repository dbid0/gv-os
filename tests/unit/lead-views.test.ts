import { describe, expect, it } from "vitest";

import {
  NO_FILTERS,
  describeFilters,
  filterLeads,
  isFiltered,
  leadFiltersQuery,
  normalizeTag,
  readLeadFilters,
  repOptions,
  tagUsage,
  tagsByLead,
  validateViewName,
} from "@/lib/tracking/lead-views";
import type { LeadSummary } from "@/lib/tracking/leads";

function lead(email: string, extra: Partial<LeadSummary> = {}): LeadSummary {
  return {
    email,
    name: null,
    reps: [],
    firstSeen: null,
    lastSeen: null,
    applied: false,
    callsBooked: 0,
    eocReports: 0,
    recordings: 0,
    deals: 0,
    paymentsCents: 0,
    latestStatus: null,
    ...extra,
  } as LeadSummary;
}

describe("normalizeTag", () => {
  it("turns what someone types into one slug", () => {
    expect(normalizeTag("  Hot Lead ")).toEqual({ ok: true, tag: "hot-lead" });
    expect(normalizeTag("needs__follow  up-")).toEqual({
      ok: true,
      tag: "needs-follow-up",
    });
  });

  it("refuses empty, punctuation and over-long tags", () => {
    expect(normalizeTag("   ")).toEqual({ ok: false, error: "Type a tag first." });
    expect(normalizeTag("vip!").ok).toBe(false);
    expect(normalizeTag("a".repeat(33)).ok).toBe(false);
    expect(normalizeTag("a".repeat(32)).ok).toBe(true);
  });
});

describe("readLeadFilters / leadFiltersQuery", () => {
  it("reads the filters it understands and drops the rest", () => {
    expect(
      readLeadFilters({
        q: ["  smith ", "ignored"],
        tag: "Hot",
        rep: " Sam Carter ",
        has: "unbooked",
        other: "x",
      }),
    ).toEqual({ q: "smith", tag: "hot", rep: "Sam Carter", has: "unbooked" });
    expect(readLeadFilters({ tag: "no way!", has: "rich", rep: "  " })).toEqual(
      NO_FILTERS,
    );
    expect(readLeadFilters({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("writes filters back in a fixed order, round-tripping", () => {
    const f = { q: "a b", tag: "hot", rep: "Sam", has: "paid" as const };
    expect(leadFiltersQuery(f)).toBe("q=a+b&tag=hot&rep=Sam&has=paid");
    expect(
      readLeadFilters(Object.fromEntries(new URLSearchParams(leadFiltersQuery(f)))),
    ).toEqual(f);
    expect(leadFiltersQuery(NO_FILTERS)).toBe("");
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, has: "paid" })).toBe(true);
  });
});

describe("describeFilters", () => {
  it("says the view in words", () => {
    expect(describeFilters(NO_FILTERS)).toBe("All leads");
    expect(
      describeFilters({ q: "smith", tag: "hot", rep: "Sam", has: "unbooked" }),
    ).toBe("Applied, never booked · Tagged hot · Rep Sam · Matching “smith”");
  });
});

describe("tagsByLead / tagUsage", () => {
  const tags = tagsByLead(
    [
      { leadEmail: "a@x.com", tag: "hot" },
      { leadEmail: "A@X.com ", tag: "vip" },
      { leadEmail: "alias@y.com", tag: "hot" }, // merged into a@x.com
      { leadEmail: "b@x.com", tag: "hot" },
      { leadEmail: "c@x.com", tag: "cold" },
    ],
    new Map([["alias@y.com", "a@x.com"]]),
  );

  it("groups tags per person, resolving alias inboxes, without duplicates", () => {
    expect(Object.fromEntries(tags)).toEqual({
      "a@x.com": ["hot", "vip"],
      "b@x.com": ["hot"],
      "c@x.com": ["cold"],
    });
  });

  it("counts people per tag, most used first then alphabetical", () => {
    expect(tagUsage(tags)).toEqual([
      { tag: "hot", leads: 2 },
      { tag: "cold", leads: 1 },
      { tag: "vip", leads: 1 },
    ]);
  });
});

describe("repOptions / filterLeads", () => {
  const leads = [
    lead("a@x.com", {
      name: "Ann",
      reps: ["Sam"],
      applied: true,
      callsBooked: 1,
      eocReports: 1,
      paymentsCents: 100,
    }),
    lead("b@x.com", { reps: ["Sam Carter", "Riley Park"], applied: true }),
    lead("c@x.com", { reps: ["riley park"], callsBooked: 2 }),
    lead("d@x.com"),
  ];
  const tags = new Map([
    ["a@x.com", ["hot"]],
    ["c@x.com", ["hot", "vip"]],
  ]);
  const ids = (f: Partial<typeof NO_FILTERS>) =>
    filterLeads(leads, { ...NO_FILTERS, ...f }, tags).map((l) => l.email[0]);

  it("offers each rep once, merged spellings, alphabetical", () => {
    expect(repOptions(leads)).toEqual(["Riley Park", "Sam Carter"]);
  });

  it("filters by tag, merged rep and stage, combined with the search", () => {
    expect(ids({})).toEqual(["a", "b", "c", "d"]);
    expect(ids({ tag: "hot" })).toEqual(["a", "c"]);
    expect(ids({ tag: "nobody" })).toEqual([]);
    expect(ids({ rep: "sam carter" })).toEqual(["a", "b"]);
    expect(ids({ rep: "Riley Park" })).toEqual(["b", "c"]);
    expect(ids({ has: "applied" })).toEqual(["a", "b"]);
    expect(ids({ has: "booked" })).toEqual(["a", "c"]);
    expect(ids({ has: "unbooked" })).toEqual(["b"]);
    expect(ids({ has: "reported" })).toEqual(["a"]);
    expect(ids({ has: "paid" })).toEqual(["a"]);
    expect(ids({ tag: "hot", has: "booked", q: "ann" })).toEqual(["a"]);
    // A full name from a rep record finds rows typed with the first name only.
    const firstNameOnly = [lead("e@x.com", { reps: ["Jo"] }), lead("f@x.com")];
    expect(
      filterLeads(firstNameOnly, { ...NO_FILTERS, rep: "Jo Park" }, new Map()).map(
        (l) => l.email,
      ),
    ).toEqual(["e@x.com"]);
  });
});

describe("validateViewName", () => {
  it("trims and collapses spaces, refusing empty and long names", () => {
    expect(validateViewName("  Hot   leads ")).toEqual({ ok: true, name: "Hot leads" });
    expect(validateViewName(" ")).toEqual({ ok: false, error: "Name the view first." });
    expect(validateViewName("x".repeat(41)).ok).toBe(false);
  });
});
