import { describe, expect, it } from "vitest";

import { ADMIN_ONLY_CAPABILITIES } from "@/lib/ai/capabilities";
import { AI_ROLES, roleHasCapability } from "@/lib/ai/roles";
import { TOOL_REGISTRY, canRunTool, toolById, toolsForRole } from "@/lib/ai/tools";

describe("ai tool registry", () => {
  it("every tool requires a capability its declared position implies", () => {
    // A tool a role is handed must be one that role's capabilities unlock.
    for (const role of AI_ROLES) {
      for (const tool of toolsForRole(role)) {
        expect(roleHasCapability(role, tool.capability)).toBe(true);
      }
    }
  });

  it("toolById finds a real tool and misses an unknown one", () => {
    expect(toolById("admin.net_month")?.capability).toBe("read.all");
    expect(toolById("does.not.exist")).toBeUndefined();
  });

  it("canRunTool gates by capability and refuses unknown ids", () => {
    expect(canRunTool("admin", "money.record_payout")).toBe(true);
    expect(canRunTool("sales_manager", "team.behind_pace")).toBe(true);
    expect(canRunTool("sales_manager", "admin.net_month")).toBe(false);
    expect(canRunTool("sales_rep", "rep.pacing")).toBe(true);
    expect(canRunTool("sales_rep", "team.behind_pace")).toBe(false);
    expect(canRunTool("sales_rep", "no.such.tool")).toBe(false);
  });

  it("the rep face gets only its own read + activity-write tools", () => {
    const ids = toolsForRole("sales_rep").map((t) => t.id);
    expect(ids).toEqual([
      "rep.pacing",
      "rep.streak",
      "rep.earnings",
      "rep.quota_gap",
      "activity.log_call",
      "activity.submit_eod",
    ]);
  });

  it("the manager face gains team reads + coaching writes, nothing more", () => {
    const caps = new Set(toolsForRole("sales_manager").map((t) => t.capability));
    expect(caps).toEqual(
      new Set(["read.own", "read.team", "write.activity", "write.coaching"]),
    );
  });

  // ---- THE HARD CONSTRAINT ----
  it("money + dev tools are ADMIN-ONLY and unreachable from manager/rep", () => {
    const moneyOrDev = TOOL_REGISTRY.filter((t) =>
      ADMIN_ONLY_CAPABILITIES.includes(t.capability),
    );
    // Such tools exist (so the test is meaningful) and are all admin-scoped.
    expect(moneyOrDev.length).toBeGreaterThan(0);

    for (const role of ["sales_manager", "sales_rep"] as const) {
      const registry = toolsForRole(role);
      // Not one tool in a non-admin registry requires a money/dev capability.
      for (const tool of registry) {
        expect(ADMIN_ONLY_CAPABILITIES).not.toContain(tool.capability);
      }
      // And every money/dev tool is explicitly un-runnable for that role.
      for (const tool of moneyOrDev) {
        expect(canRunTool(role, tool.id)).toBe(false);
      }
    }

    // The admin registry, by contrast, DOES contain them.
    const adminIds = toolsForRole("admin").map((t) => t.id);
    for (const tool of moneyOrDev) expect(adminIds).toContain(tool.id);
  });

  it("registry ids are unique", () => {
    const ids = TOOL_REGISTRY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
