import { describe, expect, it } from "vitest";

import {
  TEAM_ROLES,
  TEAM_ROLE_VALUES,
  assigneeDisplay,
  roleLabel,
  roleRank,
} from "@/lib/team-roles";

describe("team roles", () => {
  it("covers every role Daniel named for the team OS", () => {
    for (const role of [
      "copywriter",
      "va",
      "creative_director",
      "setter",
      "closer",
      "manager",
      "operator",
    ]) {
      expect(TEAM_ROLE_VALUES).toContain(role);
    }
  });

  it("has no duplicate role values", () => {
    expect(new Set(TEAM_ROLE_VALUES).size).toBe(TEAM_ROLES.length);
  });

  it("labels known roles and falls back to the raw value for old data", () => {
    expect(roleLabel("creative_director")).toBe("Creative director");
    expect(roleLabel("va")).toBe("VA");
    expect(roleLabel("astronaut")).toBe("astronaut");
  });

  it("ranks roles in display order and sinks unknown roles to the end", () => {
    expect(roleRank("operator")).toBe(0);
    expect(roleRank("closer")).toBeLessThan(roleRank("astronaut"));
    expect(roleRank("astronaut")).toBe(TEAM_ROLES.length);
  });
});

describe("assigneeDisplay", () => {
  it("prefers the roster member's name over legacy text", () => {
    expect(assigneeDisplay("Aymen", "someone else")).toBe("Aymen");
  });

  it("falls back to the legacy free-text name from pre-Team rows", () => {
    expect(assigneeDisplay(null, "Gus")).toBe("Gus");
  });

  it("treats blank legacy text as unassigned", () => {
    expect(assigneeDisplay(null, "   ")).toBeNull();
    expect(assigneeDisplay(null, null)).toBeNull();
  });
});
