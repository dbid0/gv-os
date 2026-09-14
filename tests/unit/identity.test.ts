import { describe, expect, it } from "vitest";

import { buildAliasMap } from "@/lib/tracking/aliases";
import {
  inboxesFor,
  phoneKey,
  rankMergeCandidates,
  resolveLeadRows,
  validateMerge,
} from "@/lib/tracking/identity";
import { buildLeadSummaries, type LeadEventInput } from "@/lib/tracking/leads";

const aliases = buildAliasMap([
  { aliasEmail: "pay@x.com", canonicalEmail: "person@x.com" },
  { aliasEmail: "work@x.com", canonicalEmail: "person@x.com" },
  { aliasEmail: "other-alias@x.com", canonicalEmail: "other@x.com" },
]);

describe("validateMerge", () => {
  const merge = (alias: string, canonical: string) =>
    validateMerge({ alias, canonical, aliases });

  it("accepts a fresh inbox into a person, normalised", () => {
    expect(merge("  New@X.com ", "Person@x.com")).toEqual({
      ok: true,
      alias: "new@x.com",
      canonical: "person@x.com",
    });
  });

  it("refuses every merge that would break one-hop identity", () => {
    const reasons = [
      merge("not an email", "person@x.com"),
      merge("new@x.com", "nope"),
      merge("person@x.com", "PERSON@x.com"),
      merge("pay@x.com", "person@x.com"),
      merge("pay@x.com", "someone@x.com"),
      merge("person@x.com", "someone@x.com"),
      merge("new@x.com", "pay@x.com"),
    ].map((v) => (v.ok ? "ok" : v.reason));
    expect(reasons).toEqual([
      '"not an email" isn\'t an email address.',
      "This person's email isn't valid.",
      "That's already this person's email.",
      "pay@x.com is already merged into this person.",
      "pay@x.com is already merged into person@x.com. Unmerge it there first.",
      "Other inboxes are merged into person@x.com, so it's a person of its own. Open person@x.com and merge this person into it instead.",
      "This inbox is itself merged into person@x.com. Merge new@x.com into person@x.com instead.",
    ]);
  });
});

describe("inboxesFor", () => {
  it("lists the canonical email first, then its aliases, from any of them", () => {
    expect(inboxesFor("person@x.com", aliases)).toEqual([
      "person@x.com",
      "pay@x.com",
      "work@x.com",
    ]);
    expect(inboxesFor(" PAY@x.com", aliases)).toEqual([
      "person@x.com",
      "pay@x.com",
      "work@x.com",
    ]);
    expect(inboxesFor("alone@x.com", aliases)).toEqual(["alone@x.com"]);
    // A blank email is nobody's alias: it stays a single blank entry.
    expect(inboxesFor("   ", aliases)).toEqual([""]);
  });
});

function row(email: string | null, tab: string, extra: Partial<LeadEventInput> = {}) {
  return {
    tab,
    rowIndex: 1,
    occurredAt: null,
    email,
    name: null,
    rep: null,
    status: null,
    outcome: null,
    cashCents: null,
    revenueCents: null,
    recordingUrl: null,
    notes: null,
    payload: {},
    ...extra,
  } satisfies LeadEventInput;
}

describe("resolveLeadRows", () => {
  it("returns the same array when there are no aliases", () => {
    const rows = [row("a@x.com", "applications")];
    expect(resolveLeadRows(rows, new Map())).toBe(rows);
  });

  it("keys alias rows under the person, leaving others and email-less rows alone", () => {
    const untouched = row("person@x.com", "applications");
    const noEmail = row(null, "payments");
    const out = resolveLeadRows(
      [untouched, row("pay@x.com", "payments", { cashCents: 99_700 }), noEmail],
      aliases,
    );
    expect(out[0]).toBe(untouched);
    expect(out[1].email).toBe("person@x.com");
    expect(out[2]).toBe(noEmail);
  });

  it("makes the lead builder count one person once", () => {
    const rows = [
      row("person@x.com", "applications"),
      row("pay@x.com", "payments", { cashCents: 99_700, status: "succeeded" }),
      row("work@x.com", "calls"),
    ];
    expect(buildLeadSummaries(rows)).toHaveLength(3);
    const merged = buildLeadSummaries(resolveLeadRows(rows, aliases));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      email: "person@x.com",
      applied: true,
      callsBooked: 1,
      paymentsCents: 99_700,
    });
  });
});

describe("rankMergeCandidates", () => {
  it("merges signals per email, drops this person and anyone already merged, ranks strongest first", () => {
    const out = rankMergeCandidates(
      [
        { email: "Name-Only@x.com", sharedPhone: false, sharedName: true },
        { email: "both@x.com", sharedPhone: true, sharedName: false },
        { email: "both@x.com", sharedPhone: false, sharedName: true },
        { email: "phone@x.com", sharedPhone: true, sharedName: false },
        { email: "a-phone@x.com", sharedPhone: true, sharedName: false },
        { email: "person@x.com", sharedPhone: true, sharedName: true },
        { email: "other-alias@x.com", sharedPhone: true, sharedName: true },
        { email: "nothing@x.com", sharedPhone: false, sharedName: false },
        { email: "broken", sharedPhone: true, sharedName: true },
      ],
      ["person@x.com", "pay@x.com"],
      aliases,
    );
    expect(out).toEqual([
      { email: "both@x.com", sharedPhone: true, sharedName: true },
      { email: "a-phone@x.com", sharedPhone: true, sharedName: false },
      { email: "phone@x.com", sharedPhone: true, sharedName: false },
      { email: "name-only@x.com", sharedPhone: false, sharedName: true },
    ]);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      email: `p${i}@x.com`,
      sharedPhone: true,
      sharedName: false,
    }));
    expect(rankMergeCandidates(many, [], new Map(), 3)).toHaveLength(3);
  });
});

describe("phoneKey", () => {
  it("matches on the last ten digits, refusing short or missing numbers", () => {
    expect(phoneKey("+1 (555) 010-2000")).toBe("5550102000");
    expect(phoneKey("555.010.2000")).toBe("5550102000");
    expect(phoneKey("010-2000")).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey(undefined)).toBeNull();
  });
});
