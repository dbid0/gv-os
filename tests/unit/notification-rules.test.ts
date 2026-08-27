import { describe, expect, it } from "vitest";

import {
  bodReminderRule,
  bodRule,
  driftRule,
  eodReminderRule,
  repWellbeingRule,
  signedDocRule,
  spineDriftRule,
  stalenessRule,
  syncFailureRule,
  type CheckInComplianceState,
  type IntegrationState,
  type RepWellbeingState,
  type SpineDriftRow,
} from "@/lib/notifications/rules";

const NOW = new Date("2026-08-22T12:00:00Z");

const conn = (o: Partial<IntegrationState>): IntegrationState => ({
  id: "c1",
  provider: "kit",
  label: "Racks Closes Kit",
  clientId: "rc",
  lastSyncAt: new Date("2026-08-22T11:00:00Z"),
  lastSyncNote: "7 sequences, 0 tags",
  ...o,
});

describe("syncFailureRule", () => {
  it("alerts only on failure notes, keyed by connection + note", () => {
    const failing = conn({ lastSyncNote: "sync failed: Kit 401" });
    const out = syncFailureRule([conn({}), failing]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "sync_failure",
      severity: "critical",
      dedupeKey: "sync-failure:c1:sync failed: Kit 401",
    });
  });
});

describe("stalenessRule", () => {
  it("flags >26h silence once per day; never-synced stays quiet", () => {
    const stale = conn({ id: "s1", lastSyncAt: new Date("2026-08-21T05:00:00Z") });
    const fresh = conn({ id: "f1" });
    const never = conn({ id: "n1", lastSyncAt: null });
    const out = stalenessRule([stale, fresh, never], NOW, "2026-08-22");
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe("stale:s1:2026-08-22");
    expect(out[0].severity).toBe("warning");
  });
});

describe("driftRule", () => {
  it("fires only above the 5-cent baseline, keyed per run", () => {
    expect(driftRule(null)).toEqual([]);
    expect(driftRule({ id: "r1", driftRowCount: 5, totalAbsDriftCents: 5 })).toEqual(
      [],
    );
    const out = driftRule({ id: "r2", driftRowCount: 6, totalAbsDriftCents: 105 });
    expect(out[0]).toMatchObject({
      kind: "sheet_drift",
      severity: "critical",
      dedupeKey: "drift:r2",
    });
    expect(out[0].title).toContain("$1.05");
  });
});

describe("signedDocRule", () => {
  it("one info per signed doc, keyed by the source id", () => {
    const out = signedDocRule([
      { externalId: "d1", name: "Grid Agreement", clientId: "g", completedAt: NOW },
      { externalId: "d2", name: null, clientId: null, completedAt: null },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].dedupeKey).toBe("signed:d1");
    expect(out[1].title).toBe("Agreement signed");
  });
});

describe("bodRule", () => {
  const offers = [
    {
      clientId: "c1",
      slug: "the-grid",
      name: "The Grid",
      bodAlertTime: "12:00",
      timezone: "America/Chicago",
      mtdCashCents: 1_234_500,
    },
  ];
  // 2026-08-23 17:30 UTC = 12:30 America/Chicago (CDT).
  const afterNoonCT = new Date("2026-08-23T17:30:00Z");
  // 2026-08-23 15:00 UTC = 10:00 America/Chicago.
  const beforeNoonCT = new Date("2026-08-23T15:00:00Z");

  it("fires once the offer's local time passes the alert time", () => {
    const out = bodRule(offers, afterNoonCT, "2026-08-23");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("BOD — The Grid: $12,345 month to date");
    expect(out[0].dedupeKey).toBe("bod:the-grid:2026-08-23");
    expect(out[0].severity).toBe("info");
  });

  it("stays silent before the alert time", () => {
    expect(bodRule(offers, beforeNoonCT, "2026-08-23")).toHaveLength(0);
  });

  it("dedupe key pins to the day so it fires at most once daily", () => {
    const a = bodRule(offers, afterNoonCT, "2026-08-23")[0].dedupeKey;
    const later = new Date("2026-08-23T23:00:00Z");
    const b = bodRule(offers, later, "2026-08-23")[0].dedupeKey;
    expect(a).toBe(b);
  });
});

describe("repWellbeingRule", () => {
  const rep = (o: Partial<RepWellbeingState>): RepWellbeingState => ({
    repId: "r1",
    repName: "Jordan",
    clientId: "g",
    teamName: "The Grid",
    score: 2,
    dateKey: "2026-08-25",
    ...o,
  });

  it("flags a score below 3 with a warning to the manager", () => {
    const out = repWellbeingRule([rep({ score: 2 })]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].title).toBe("Check on Jordan — low check-in today");
    expect(out[0].body).toContain("2/5");
    expect(out[0].dedupeKey).toBe("wellbeing:r1:2026-08-25");
  });

  it("ignores a healthy score of 3 or higher", () => {
    expect(repWellbeingRule([rep({ score: 3 })])).toHaveLength(0);
    expect(repWellbeingRule([rep({ score: 5 })])).toHaveLength(0);
  });

  it("treats a blank / zero score as not-reported, not low", () => {
    expect(repWellbeingRule([rep({ score: 0 })])).toHaveLength(0);
  });

  it("omits the team suffix when the rep has no team", () => {
    const out = repWellbeingRule([rep({ teamName: null, score: 1 })]);
    expect(out[0].body).toBe(
      "Jordan rated how they're feeling 1/5 on today's EOD. Reach out.",
    );
  });

  it("dedupes to one alert per rep per day", () => {
    const out = repWellbeingRule([rep({ score: 1 }), rep({ score: 2 })]);
    // Same rep + day → callers rely on the dedupe key collapsing these.
    expect(out.every((c) => c.dedupeKey === "wellbeing:r1:2026-08-25")).toBe(true);
  });
});

describe("eodReminderRule", () => {
  const missing: CheckInComplianceState = {
    submitted: 2,
    total: 4,
    missing: ["Jordan", "Maya"],
  };
  // 2026-08-23 21:00 UTC = 16:00 CT (before 8 PM). 2026-08-24 01:30 UTC = 20:30 CT.
  const beforeEight = new Date("2026-08-23T21:00:00Z");
  const afterEight = new Date("2026-08-24T01:30:00Z");

  it("fires at or after 8 PM CT and names who's out, keyed to the day", () => {
    const out = eodReminderRule(missing, afterEight, "2026-08-23");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "eod_missing", severity: "warning" });
    expect(out[0].title).toBe("EOD not in: 2 of 4 still out");
    expect(out[0].body).toContain("Jordan, Maya");
    expect(out[0].dedupeKey).toBe("eod-missing:2026-08-23");
  });

  it("stays silent before 8 PM CT", () => {
    expect(eodReminderRule(missing, beforeEight, "2026-08-23")).toHaveLength(0);
  });

  it("stays silent when everyone has filed", () => {
    const allIn: CheckInComplianceState = { submitted: 4, total: 4, missing: [] };
    expect(eodReminderRule(allIn, afterEight, "2026-08-23")).toHaveLength(0);
  });

  it("dedupes to one alert per day", () => {
    const later = new Date("2026-08-24T04:00:00Z"); // 23:00 CT, same business day
    const a = eodReminderRule(missing, afterEight, "2026-08-23")[0].dedupeKey;
    const b = eodReminderRule(missing, later, "2026-08-23")[0].dedupeKey;
    expect(a).toBe(b);
  });
});

describe("bodReminderRule", () => {
  const missing: CheckInComplianceState = {
    submitted: 1,
    total: 3,
    missing: ["Sam", "Kai"],
  };
  // 2026-08-23 13:00 UTC = 08:00 CT (before 10 AM). 15:30 UTC = 10:30 CT.
  const beforeTen = new Date("2026-08-23T13:00:00Z");
  const afterTen = new Date("2026-08-23T15:30:00Z");

  it("fires from mid-morning CT and names who's out, keyed to the day", () => {
    const out = bodReminderRule(missing, afterTen, "2026-08-23");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "bod_missing", severity: "warning" });
    expect(out[0].title).toBe("BOD not in: 2 of 3 still out");
    expect(out[0].body).toContain("Sam, Kai");
    expect(out[0].dedupeKey).toBe("bod-missing:2026-08-23");
  });

  it("stays silent before mid-morning CT", () => {
    expect(bodReminderRule(missing, beforeTen, "2026-08-23")).toHaveLength(0);
  });

  it("stays silent when everyone has checked in", () => {
    const allIn: CheckInComplianceState = { submitted: 3, total: 3, missing: [] };
    expect(bodReminderRule(allIn, afterTen, "2026-08-23")).toHaveLength(0);
  });
});

import { notificationHref } from "@/lib/notifications/links";

describe("notificationHref", () => {
  it("routes each kind to the spot that resolves it", () => {
    expect(notificationHref("sync_failure", null)).toBe("/settings/integrations");
    expect(notificationHref("integration_stale", "brady")).toBe(
      "/settings/integrations",
    );
    expect(notificationHref("sheet_drift", null)).toBe("/accounting");
    expect(notificationHref("agreement_signed", "brady")).toBe("/w/brady");
    expect(notificationHref("agreement_signed", null)).toBe("/clients");
    expect(notificationHref("bod_digest", "the-grid")).toBe("/w/the-grid");
    expect(notificationHref("bod_digest", null)).toBe("/dashboard");
    expect(notificationHref("rep_wellbeing", null)).toBe("/sales/eod");
    expect(notificationHref("eod_missing", null)).toBe("/sales/eod");
    expect(notificationHref("bod_missing", null)).toBe("/sales/eod");
    expect(notificationHref("unknown_kind", null)).toBe("/notifications");
  });
});

describe("spineDriftRule", () => {
  const rows: SpineDriftRow[] = [
    { scope: "the-grid", name: "The Grid", month: "2026-08", cashDeltaCents: 50_000 },
    { scope: "agency", name: "Agency book", month: "2026-08", cashDeltaCents: -12_500 },
    { scope: "the-vault", name: "The Vault", month: "2026-08", cashDeltaCents: 0 },
  ];

  it("raises one critical alert per drifting book, with the exact delta", () => {
    const out = spineDriftRule(rows);
    expect(out).toHaveLength(2); // the zero-delta row is skipped
    expect(out[0]).toMatchObject({
      kind: "spine_drift",
      severity: "critical",
      title: "The Grid 2026-08: sources off by $500.00",
      dedupeKey: "spine-drift:the-grid:2026-08:50000",
    });
    expect(out[1].title).toContain("$125.00"); // abs value of the agency delta
  });

  it("keys the alert by the delta so a changed drift re-fires and green clears it", () => {
    expect(spineDriftRule([])).toEqual([]);
    const a = spineDriftRule([rows[0]])[0].dedupeKey;
    const b = spineDriftRule([{ ...rows[0], cashDeltaCents: 60_000 }])[0].dedupeKey;
    expect(a).not.toBe(b);
  });
});
