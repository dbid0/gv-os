import { describe, expect, it } from "vitest";

import { defaultTemplateForRole } from "@/lib/sales/default-templates";

describe("full-cycle default EOD template", () => {
  it("is the union of the setter's and the closer's day", () => {
    const t = defaultTemplateForRole("full_cycle");
    // Prospecting side
    expect(t.baseFields).toContain("dials");
    expect(t.baseFields).toContain("sets_booked");
    // Closing side
    expect(t.baseFields).toContain("calls_taken");
    expect(t.baseFields).toContain("shows");
    // Both derived rates, so the leaderboard reads them like any rep
    expect(t.calcFields.map((c) => c.key)).toEqual(["set_rate", "show_rate"]);
  });

  it("does not fall through to the manager default", () => {
    const manager = defaultTemplateForRole("manager");
    const full = defaultTemplateForRole("full_cycle");
    expect(full.baseFields).not.toEqual(manager.baseFields);
  });
});
