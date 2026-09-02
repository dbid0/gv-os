import { describe, expect, it } from "vitest";

import {
  clockLabelCT,
  minutesAfterMidnightCT,
  minutesToLabel,
  summarizeBodTimes,
} from "@/lib/brief/bod-times";

/** 2026-09-01 is CDT (UTC-5), so 12:48Z is 7:48 AM Central. */
const at = (iso: string) => new Date(iso);

describe("minutesAfterMidnightCT", () => {
  it("reads the time in CENTRAL, not the server's zone", () => {
    expect(minutesAfterMidnightCT(at("2026-09-01T12:48:00Z"))).toBe(7 * 60 + 48);
  });

  it("handles Central midnight as 0, not 1440", () => {
    expect(minutesAfterMidnightCT(at("2026-09-01T05:00:00Z"))).toBe(0);
  });

  it("keeps a late-evening filing on its own day", () => {
    // 03:30Z on the 2nd is 10:30 PM Central on the 1st.
    expect(minutesAfterMidnightCT(at("2026-09-02T03:30:00Z"))).toBe(22 * 60 + 30);
  });

  it("respects the DST offset change", () => {
    // January is CST (UTC-6): 13:00Z is 7:00 AM, not 8:00.
    expect(minutesAfterMidnightCT(at("2026-01-15T13:00:00Z"))).toBe(7 * 60);
  });
});

describe("clockLabelCT / minutesToLabel", () => {
  it("prints a readable Central clock time", () => {
    expect(clockLabelCT(at("2026-09-01T12:48:00Z"))).toBe("7:48 AM");
  });

  it("renders noon and midnight without a zero hour", () => {
    expect(minutesToLabel(0)).toBe("12:00 AM");
    expect(minutesToLabel(12 * 60)).toBe("12:00 PM");
    expect(minutesToLabel(13 * 60 + 5)).toBe("1:05 PM");
  });
});

describe("summarizeBodTimes", () => {
  const sub = (name: string, iso: string) => ({
    repName: name,
    teamName: "The Grid",
    submittedAt: at(iso),
  });

  it("sorts filings earliest first and reports both ends", () => {
    const s = summarizeBodTimes([
      sub("Late", "2026-09-01T15:00:00Z"), // 10:00 AM
      sub("Early", "2026-09-01T11:30:00Z"), // 6:30 AM
      sub("Mid", "2026-09-01T13:00:00Z"), // 8:00 AM
    ]);
    expect(s.filed.map((f) => f.repName)).toEqual(["Early", "Mid", "Late"]);
    expect(s.earliest?.label).toBe("6:30 AM");
    expect(s.latest?.label).toBe("10:00 AM");
  });

  it("uses the MEDIAN so one outlier can't drag the typical time", () => {
    const s = summarizeBodTimes([
      sub("A", "2026-09-01T12:00:00Z"), // 7:00
      sub("B", "2026-09-01T13:00:00Z"), // 8:00
      sub("Outlier", "2026-09-02T04:00:00Z"), // 11:00 PM
    ]);
    expect(s.medianLabel).toBe("8:00 AM");
  });

  it("averages the middle two on an even count", () => {
    const s = summarizeBodTimes([
      sub("A", "2026-09-01T12:00:00Z"), // 7:00
      sub("B", "2026-09-01T13:00:00Z"), // 8:00
    ]);
    expect(s.medianLabel).toBe("7:30 AM");
  });

  it("is empty-safe — nobody filed yet is not an error", () => {
    const s = summarizeBodTimes([]);
    expect(s.filed).toEqual([]);
    expect(s.earliest).toBeNull();
    expect(s.medianMinutes).toBeNull();
    expect(s.medianLabel).toBeNull();
  });

  it("handles a single filing", () => {
    const s = summarizeBodTimes([sub("Solo", "2026-09-01T12:48:00Z")]);
    expect(s.medianLabel).toBe("7:48 AM");
    expect(s.earliest?.repName).toBe("Solo");
    expect(s.latest?.repName).toBe("Solo");
  });
});
