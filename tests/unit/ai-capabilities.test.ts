import { describe, expect, it } from "vitest";

import {
  ADMIN_ONLY_CAPABILITIES,
  CAPABILITIES,
  isAdminOnlyCapability,
  isCapability,
} from "@/lib/ai/capabilities";

describe("ai capabilities", () => {
  it("lists the seven capability atoms", () => {
    expect(CAPABILITIES).toEqual([
      "read.own",
      "read.team",
      "read.all",
      "write.activity",
      "write.coaching",
      "write.money",
      "dev.inspect",
    ]);
  });

  it("isCapability recognises members and rejects strangers", () => {
    expect(isCapability("read.own")).toBe(true);
    expect(isCapability("write.money")).toBe(true);
    expect(isCapability("read.everything")).toBe(false);
    expect(isCapability("")).toBe(false);
  });

  it("marks exactly write.money and dev.inspect as admin-only", () => {
    expect(ADMIN_ONLY_CAPABILITIES).toEqual(["write.money", "dev.inspect"]);
    expect(isAdminOnlyCapability("write.money")).toBe(true);
    expect(isAdminOnlyCapability("dev.inspect")).toBe(true);
    expect(isAdminOnlyCapability("read.all")).toBe(false);
    expect(isAdminOnlyCapability("write.coaching")).toBe(false);
  });
});
