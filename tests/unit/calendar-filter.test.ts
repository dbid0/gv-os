import { describe, expect, it } from "vitest";

import { isSoftwareDevItem } from "@/lib/calendar/filter";

describe("isSoftwareDevItem", () => {
  it("keeps real client + team work visible", () => {
    // The exact task titles the app seeds, plus their notes — none is dev work.
    const real = [
      "Review closer call recordings",
      "Refresh the VSL hook",
      "Approve this week's ad creative",
      "1:1 with the setter team",
      "Rebuild the follow-up sequence",
      "Audit speed-to-lead",
      "Draft the monthly rev-share statement",
      "Update the offer's tracking sheet",
      "Onboard the new closer",
      "QA the application form",
      "Weekly pipeline review",
      "Send payout statements",
      "Tighten the booking reminders",
      "Plan next month's content",
      "Build the client's backend funnel",
      "Draft the PR announcement for the launch",
    ];
    for (const title of real) {
      expect(isSoftwareDevItem({ title, notes: "demo-seed task" })).toBe(false);
    }
  });

  it("hides internal GV OS / software-dev items", () => {
    const dev = [
      "Ship the calendar rework in GV OS",
      "Merge PR #221 to main",
      "Fix the typecheck errors before deploy",
      "Deploy GV OS to Vercel",
      "Update the Drizzle schema for action items",
      "Refactor the calendar component",
      "Add unit tests for the reconciler",
      "Wire the Supabase migration",
      "Fix bug in the accounting ledger",
      "Run the linter and prettier",
      "Build the new API endpoint",
    ];
    for (const title of dev) {
      expect(isSoftwareDevItem({ title })).toBe(true);
    }
  });

  it("catches dev work via origin notes even when the title is vague", () => {
    expect(
      isSoftwareDevItem({
        title: "Follow up on this",
        notes: "From call: GV OS build",
      }),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSoftwareDevItem({ title: "MERGE the branch into GV-OS" })).toBe(true);
  });
});
