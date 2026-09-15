import { describe, expect, it } from "vitest";

import { validateExclusionReason } from "@/lib/bookings/exclusion-reason";

describe("validateExclusionReason", () => {
  it("tidies a reason and refuses a missing or overlong one", () => {
    expect(validateExclusionReason("  test   booking ")).toEqual({
      ok: true,
      reason: "test booking",
    });
    expect(validateExclusionReason(" ab ").ok).toBe(false);
    expect(validateExclusionReason("x".repeat(201))).toEqual({
      ok: false,
      error: "Keep the reason to 200 characters.",
    });
  });
});
