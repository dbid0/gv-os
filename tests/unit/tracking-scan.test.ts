import { describe, expect, it } from "vitest";

import { mapFields } from "@/lib/tracking/fields";
import { parseTrackingTab } from "@/lib/tracking/parse";
import { scanTab, scanWarnings, type TabScan } from "@/lib/tracking/scan";

const scan = (over: Partial<TabScan> = {}): TabScan => ({
  tab: "calls",
  rows: 0,
  dated: 0,
  identified: 0,
  withRecording: 0,
  unmappedColumns: [],
  missingFields: [],
  ...over,
});

describe("scanTab", () => {
  it("counts what a per-day metric can actually see", () => {
    const headers = ["Timestamp", "Call Date", "Email", "Call Recording Link"];
    const { rows, fields, unmapped } = parseTrackingTab("calls", [
      headers,
      ["2026-08-01 10:00:00", "", "a@b.com", ""],
      ["", "", "c@d.com", "https://fathom.video/share/x"],
      // "-" is a closer's shorthand for "no recording", not a link.
      ["", "", "", "-"],
    ]);
    const s = scanTab("calls", rows, fields, unmapped);
    expect(s.rows).toBe(3);
    expect(s.dated).toBe(1);
    expect(s.identified).toBe(2);
    expect(s.withRecording).toBe(1);
  });

  it("reports the fields this tab has no column for", () => {
    const fields = mapFields(["Timestamp", "Email"]);
    const s = scanTab("applications", [], fields, []);
    expect(s.missingFields).toContain("recordingUrl");
    expect(s.missingFields).toContain("cash");
    expect(s.missingFields).not.toContain("email");
  });
});

describe("scanWarnings", () => {
  it("flags the tab whose dates are mostly missing", () => {
    // The real case: The Grid's Calls Log is 109 rows with 7 dated, so every
    // per-day call figure is reading 6% of the tab.
    const out = scanWarnings([scan({ tab: "calls", rows: 109, dated: 7 })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("102 of 109");
    expect(out[0]).toContain("94%");
  });

  it("stays quiet about a handful of blanks in a hand-kept sheet", () => {
    expect(scanWarnings([scan({ tab: "applications", rows: 100, dated: 95 })])).toEqual(
      [],
    );
  });

  it("says nothing about an empty tab", () => {
    // An offer that hasn't started logging isn't a data-quality problem.
    expect(scanWarnings([scan({ tab: "eoc", rows: 0, dated: 0 })])).toEqual([]);
  });

  it("is silent when every row is dated", () => {
    expect(scanWarnings([scan({ tab: "deals", rows: 16, dated: 16 })])).toEqual([]);
  });
});
