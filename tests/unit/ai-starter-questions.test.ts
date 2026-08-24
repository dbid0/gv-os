import { describe, expect, it } from "vitest";

import { STARTER_QUESTIONS, starterQuestionsForRole } from "@/lib/ai/starter-questions";
import { toolById } from "@/lib/ai/tools";

describe("ai starter questions", () => {
  it("every starter maps to a real READ tool", () => {
    for (const q of STARTER_QUESTIONS) {
      const tool = toolById(q.toolId);
      expect(tool, q.toolId).toBeDefined();
      expect(tool!.kind).toBe("read");
      expect(q.prompt.length).toBeGreaterThan(0);
    }
  });

  it("a rep only sees rep starters", () => {
    const ids = starterQuestionsForRole("sales_rep").map((s) => s.toolId);
    expect(ids).toEqual([
      "rep.pacing",
      "rep.streak",
      "rep.conversion",
      "rep.earnings",
      "rep.quota_gap",
      "rep.best_day",
    ]);
    // Every rep starter is genuinely a rep-scoped tool, never a team/admin one.
    expect(ids.every((id) => id.startsWith("rep."))).toBe(true);
  });

  it("a manager sees rep + team starters but no admin starters", () => {
    const ids = starterQuestionsForRole("sales_manager").map((s) => s.toolId);
    expect(ids).toContain("rep.pacing");
    expect(ids).toContain("team.behind_pace");
    expect(ids).toContain("team.standings");
    expect(ids.some((id) => id.startsWith("admin."))).toBe(false);
  });

  it("an admin sees the admin starters too", () => {
    const ids = starterQuestionsForRole("admin").map((s) => s.toolId);
    expect(ids).toContain("admin.net_month");
    expect(ids).toContain("admin.client_trend");
    expect(ids).toContain("admin.payout_owed");
    // Resolved starters carry their tool.
    const net = starterQuestionsForRole("admin").find(
      (s) => s.toolId === "admin.net_month",
    );
    expect(net?.tool.capability).toBe("read.all");
  });
});
