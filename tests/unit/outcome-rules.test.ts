import { describe, expect, it } from "vitest";

import {
  describeOutcomeRule,
  effectsFor,
  outcomeNotification,
  validateOutcomeRule,
} from "@/lib/calls/outcome-rules";
import { notificationHref } from "@/lib/notifications/links";

describe("validateOutcomeRule", () => {
  it("normalizes the tag and keeps notify", () => {
    expect(
      validateOutcomeRule({ outcome: "no_show", tag: " Rebook Me ", notify: true }),
    ).toEqual({
      ok: true,
      rule: { outcome: "no_show", tag: "rebook-me", notify: true },
    });
    expect(validateOutcomeRule({ outcome: "closed", tag: "", notify: true })).toEqual({
      ok: true,
      rule: { outcome: "closed", tag: null, notify: true },
    });
  });

  it("refuses an unknown outcome, a bad tag, and a rule that does nothing", () => {
    expect(
      validateOutcomeRule({ outcome: "ghosted", tag: "x!", notify: false }),
    ).toEqual({
      ok: false,
      errors: [
        "Pick the outcome this rule runs on.",
        "Tags are up to 32 letters, numbers and dashes.",
      ],
    });
    expect(
      validateOutcomeRule({ outcome: "closed", tag: "  ", notify: false }),
    ).toEqual({
      ok: false,
      errors: ["A rule needs a tag to add, a notification, or both."],
    });
  });
});

describe("describeOutcomeRule", () => {
  it("says what the rule does", () => {
    expect(
      describeOutcomeRule({ outcome: "no_show", tag: "rebook", notify: true }),
    ).toBe("Filed as No-show → tag rebook · notify the team");
    expect(describeOutcomeRule({ outcome: "closed", tag: null, notify: true })).toBe(
      "Filed as Closed → notify the team",
    );
    expect(
      describeOutcomeRule({ outcome: "not_a_fit", tag: "nurture", notify: false }),
    ).toBe("Filed as Showed, not a fit → tag nurture");
  });
});

describe("effectsFor", () => {
  const rules = [
    { outcome: "no_show" as const, tag: "rebook", notify: false },
    { outcome: "no_show" as const, tag: "rebook", notify: true },
    { outcome: "no_show" as const, tag: "cold", notify: false },
    { outcome: "closed" as const, tag: null, notify: true },
  ];

  it("combines every rule for the outcome: each tag once, notify if any asks", () => {
    expect(effectsFor(rules, "no_show")).toEqual({
      tags: ["cold", "rebook"],
      notify: true,
    });
    expect(effectsFor(rules, "closed")).toEqual({ tags: [], notify: true });
    expect(effectsFor(rules, "follow_up")).toEqual({ tags: [], notify: false });
  });
});

describe("outcomeNotification", () => {
  it("is keyed to the report so a restore never notifies twice", () => {
    const base = { id: "r1", clientId: "c1", leadEmail: "lead@x.com" };
    expect(
      outcomeNotification({ ...base, outcome: "no_show", tags: ["rebook"] }),
    ).toEqual({
      kind: "call_outcome",
      severity: "info",
      title: "Call filed as No-show: lead@x.com",
      body: "Tagged rebook.",
      clientId: "c1",
      dedupeKey: "call-outcome:r1",
    });
    expect(
      outcomeNotification({ ...base, outcome: "mystery", tags: [] }),
    ).toMatchObject({
      title: "Call filed as mystery: lead@x.com",
      body: null,
    });
  });
});

describe("notificationHref for call outcomes", () => {
  it("opens the offer's Calls page", () => {
    expect(notificationHref("call_outcome", "demo-offer")).toBe("/w/demo-offer/calls");
    expect(notificationHref("call_outcome", null)).toBe("/notifications");
  });
});
