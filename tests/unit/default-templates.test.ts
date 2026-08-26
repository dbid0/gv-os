import { describe, expect, it } from "vitest";

import { BASE_EOD_FIELD_KEYS } from "@/lib/sales/eod-fields";
import {
  defaultTemplateForRole,
  defaultTemplateName,
} from "@/lib/sales/default-templates";

describe("defaultTemplateForRole", () => {
  it("gives closers a calls→shows set with a show-rate metric", () => {
    const t = defaultTemplateForRole("closer");
    expect(t.baseFields).toContain("calls_taken");
    expect(t.baseFields).toContain("shows");
    expect(t.calcFields[0]).toMatchObject({
      key: "show_rate",
      numerator: "shows",
      denominator: "calls_taken",
      format: "percent",
    });
  });

  it("gives setters a dials→sets set with a set-rate metric", () => {
    const t = defaultTemplateForRole("setter");
    expect(t.baseFields).toEqual([
      "dials",
      "connects",
      "sets_booked",
      "follow_up_calls",
    ]);
    expect(t.calcFields[0].denominator).toBe("dials");
  });

  it("gives DM setters a DMs→sets set", () => {
    const t = defaultTemplateForRole("dm_setter");
    expect(t.baseFields).toContain("dms_sent");
    expect(t.calcFields[0].denominator).toBe("dms_sent");
  });

  it("falls back to a light oversight set with no calc for managers/unknown", () => {
    const mgr = defaultTemplateForRole("manager");
    expect(mgr.calcFields).toHaveLength(0);
    expect(defaultTemplateForRole("something_else").baseFields).toEqual(mgr.baseFields);
  });

  it("only ever references keys from the shared base vocabulary", () => {
    for (const role of ["closer", "setter", "dm_setter", "manager"]) {
      const t = defaultTemplateForRole(role);
      for (const key of t.baseFields) {
        expect(BASE_EOD_FIELD_KEYS).toContain(key);
      }
      for (const c of t.calcFields) {
        expect(BASE_EOD_FIELD_KEYS).toContain(c.numerator);
        expect(BASE_EOD_FIELD_KEYS).toContain(c.denominator);
      }
    }
  });

  it("names a template after its role", () => {
    expect(defaultTemplateName("Closer")).toBe("Closer — Daily EOD");
  });
});
