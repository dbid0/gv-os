import { describe, expect, it } from "vitest";

import type { KitOverviewRow } from "@/lib/email/queries";
import {
  type MemberReportRow,
  type MemberWorkItem,
  buildMemberEmailCard,
  summarizeEodActivity,
  summarizeWork,
} from "@/lib/team-profile";

const work = (over: Partial<MemberWorkItem>): MemberWorkItem => ({
  id: Math.random().toString(36),
  title: "Task",
  status: "not_started",
  cadence: "weekly",
  dueDate: null,
  clientName: null,
  ...over,
});

describe("summarizeWork", () => {
  it("buckets by status and counts the total", () => {
    const s = summarizeWork(
      [
        work({ status: "not_started" }),
        work({ status: "in_progress" }),
        work({ status: "completed" }),
        work({ status: "completed" }),
      ],
      "2026-08-26",
    );
    expect(s).toMatchObject({ total: 4, toDo: 1, inProgress: 1, done: 2 });
  });

  it("treats an unknown status as to-do, never dropping a row", () => {
    const s = summarizeWork([work({ status: "weird" })], "2026-08-26");
    expect(s.total).toBe(1);
    expect(s.toDo).toBe(1);
  });

  it("counts overdue only for open items past their due date", () => {
    const s = summarizeWork(
      [
        work({ status: "not_started", dueDate: "2026-08-20" }), // overdue
        work({ status: "in_progress", dueDate: "2026-08-25" }), // overdue
        work({ status: "not_started", dueDate: "2026-08-26" }), // due today, not overdue
        work({ status: "not_started", dueDate: "2026-09-01" }), // future
        work({ status: "completed", dueDate: "2026-08-01" }), // done, never overdue
        work({ status: "not_started", dueDate: null }), // no due date
      ],
      "2026-08-26",
    );
    expect(s.overdue).toBe(2);
  });
});

const report = (over: Partial<MemberReportRow>): MemberReportRow => ({
  id: Math.random().toString(36),
  kind: "eod",
  reportDate: new Date("2026-08-26T20:00:00Z"),
  metrics: {},
  notes: null,
  ...over,
});

describe("summarizeEodActivity", () => {
  it("takes the latest date per cadence regardless of input order", () => {
    const s = summarizeEodActivity(
      [
        report({ kind: "eod", reportDate: new Date("2026-08-24T20:00:00Z") }),
        report({ kind: "eod", reportDate: new Date("2026-08-26T20:00:00Z") }),
        report({ kind: "bod", reportDate: new Date("2026-08-25T13:00:00Z") }),
      ],
      new Date("2026-08-26T00:00:00Z"),
    );
    expect(s.eodCount).toBe(2);
    expect(s.bodCount).toBe(1);
    expect(s.lastEodAt).toEqual(new Date("2026-08-26T20:00:00Z"));
    expect(s.lastBodAt).toEqual(new Date("2026-08-25T13:00:00Z"));
  });

  it("marks filedLatestDay when the last EOD falls on the team's latest EOD day", () => {
    const s = summarizeEodActivity(
      [report({ kind: "eod", reportDate: new Date("2026-08-26T23:30:00Z") })],
      new Date("2026-08-26T00:00:00Z"),
    );
    expect(s.filedLatestDay).toBe(true);
  });

  it("is not up to date when the last EOD is an earlier day", () => {
    const s = summarizeEodActivity(
      [report({ kind: "eod", reportDate: new Date("2026-08-25T20:00:00Z") })],
      new Date("2026-08-26T00:00:00Z"),
    );
    expect(s.filedLatestDay).toBe(false);
  });

  it("handles no reports and no reference day honestly", () => {
    const s = summarizeEodActivity([], null);
    expect(s).toMatchObject({
      eodCount: 0,
      bodCount: 0,
      lastEodAt: null,
      lastBodAt: null,
      filedLatestDay: false,
    });
  });
});

const overview = (over: Partial<KitOverviewRow>): KitOverviewRow => ({
  integrationId: "int-1",
  label: "Kit",
  clientName: "The Vault",
  accountName: "Vault Media",
  plan: "creator",
  sequenceCount: 4,
  tagCount: 12,
  subscriberCount: 500,
  sequences: [
    { id: 1, name: "Welcome" },
    { id: 2, name: "Nurture", hold: true },
    { id: 3, name: "Winback" },
  ],
  takenAt: new Date("2026-08-26T06:00:00Z"),
  ...over,
});

describe("buildMemberEmailCard", () => {
  it("counts only non-held sequences as active", () => {
    const card = buildMemberEmailCard(overview({}), []);
    expect(card.activeSequences).toBe(2);
    expect(card.sequenceCount).toBe(4);
  });

  it("derives net added and the series bounds from the growth points", () => {
    const series = [
      { at: new Date("2026-08-01T06:00:00Z"), value: 420 },
      { at: new Date("2026-08-13T06:00:00Z"), value: 470 },
      { at: new Date("2026-08-26T06:00:00Z"), value: 500 },
    ];
    const card = buildMemberEmailCard(overview({}), series);
    expect(card.netAdded).toBe(80);
    expect(card.firstAt).toEqual(new Date("2026-08-01T06:00:00Z"));
    expect(card.series).toHaveLength(3);
  });

  it("leaves net added null with fewer than two points", () => {
    expect(buildMemberEmailCard(overview({}), []).netAdded).toBeNull();
    expect(
      buildMemberEmailCard(overview({}), [
        { at: new Date("2026-08-26T06:00:00Z"), value: 500 },
      ]).netAdded,
    ).toBeNull();
  });
});
