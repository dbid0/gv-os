import { describe, expect, it } from "vitest";

import {
  BUSINESS_TIME_ZONE,
  dayEndIn,
  dayKeyIn,
  dayStartIn,
  normalizeTimeZone,
  zoneAbbreviation,
} from "@/lib/time/zone";

describe("normalizeTimeZone", () => {
  it("accepts real IANA zones and refuses anything else", () => {
    expect(normalizeTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(normalizeTimeZone(" Asia/Singapore ")).toBe("Asia/Singapore");
    expect(normalizeTimeZone("Mars/Olympus")).toBeNull();
    expect(normalizeTimeZone("")).toBeNull();
    expect(normalizeTimeZone("x".repeat(65))).toBeNull();
    expect(normalizeTimeZone(undefined)).toBeNull();
    expect(BUSINESS_TIME_ZONE).toBe("America/Chicago");
  });
});

describe("dayKeyIn", () => {
  it("puts one moment on each viewer's own calendar day", () => {
    const at = new Date("2026-09-15T03:30:00Z");
    expect(dayKeyIn(at, "America/Los_Angeles")).toBe("2026-09-14");
    expect(dayKeyIn(at, "America/Chicago")).toBe("2026-09-14");
    expect(dayKeyIn(at, "Europe/London")).toBe("2026-09-15");
    expect(dayKeyIn(at, "Asia/Singapore")).toBe("2026-09-15");
  });
});

describe("dayStartIn / dayEndIn", () => {
  it("bounds a day at the viewer's local midnight", () => {
    expect(dayStartIn("2026-09-14", "America/Chicago").toISOString()).toBe(
      "2026-09-14T05:00:00.000Z",
    );
    expect(dayEndIn("2026-09-14", "America/Chicago").toISOString()).toBe(
      "2026-09-15T04:59:59.999Z",
    );
    expect(dayStartIn("2026-09-14", "Asia/Singapore").toISOString()).toBe(
      "2026-09-13T16:00:00.000Z",
    );
    expect(dayStartIn("2026-09-14", "UTC").toISOString()).toBe(
      "2026-09-14T00:00:00.000Z",
    );
  });

  it("handles DST days (23- and 25-hour days) and month/year ends", () => {
    // US spring forward 2026-03-08: local midnight is still CST (-6).
    expect(dayStartIn("2026-03-08", "America/Chicago").toISOString()).toBe(
      "2026-03-08T06:00:00.000Z",
    );
    expect(dayEndIn("2026-03-08", "America/Chicago").toISOString()).toBe(
      "2026-03-09T04:59:59.999Z",
    );
    // Fall back 2026-11-01.
    expect(dayEndIn("2026-11-01", "America/Chicago").toISOString()).toBe(
      "2026-11-02T05:59:59.999Z",
    );
    expect(dayEndIn("2026-12-31", "UTC").toISOString()).toBe(
      "2026-12-31T23:59:59.999Z",
    );
  });

  it("refuses a malformed day key", () => {
    expect(() => dayStartIn("09/14/2026", "UTC")).toThrow(/Not a day key/);
  });
});

describe("zoneAbbreviation", () => {
  it("names the zone for a 'times shown in' label", () => {
    expect(zoneAbbreviation(new Date("2026-09-14T12:00:00Z"), "America/Chicago")).toBe(
      "CDT",
    );
    expect(zoneAbbreviation(new Date("2026-01-14T12:00:00Z"), "America/Chicago")).toBe(
      "CST",
    );
    expect(zoneAbbreviation(new Date("2026-09-14T12:00:00Z"), "UTC")).toBe("UTC");
  });
});
