import { describe, expect, it } from "vitest";

import { previousBounds } from "@/lib/transactions/homepage";

describe("previousBounds", () => {
  it("is the window immediately before, same length", () => {
    expect(
      previousBounds({ from: "2026-09-01", to: "2026-09-07", label: "x" }),
    ).toEqual({
      from: "2026-08-25",
      to: "2026-08-31",
      label: "previous 7 days",
    });
  });

  it("a single day compares to the day before", () => {
    expect(
      previousBounds({ from: "2026-09-08", to: "2026-09-08", label: "Today" }),
    ).toEqual({
      from: "2026-09-07",
      to: "2026-09-07",
      label: "previous day",
    });
  });

  it("all-time has NO previous period — null, never a made-up delta", () => {
    expect(previousBounds({ from: null, to: null, label: "All time" })).toBeNull();
  });
});
