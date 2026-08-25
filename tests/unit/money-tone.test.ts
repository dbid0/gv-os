import { describe, expect, it } from "vitest";

import { moneyTone } from "@/lib/money-tone";

describe("moneyTone", () => {
  it("reads money out as red", () => {
    expect(moneyTone("out")).toEqual({ isOut: true, className: "text-destructive" });
  });

  it("reads money in as green", () => {
    expect(moneyTone("in")).toEqual({ isOut: false, className: "text-success" });
  });

  it("treats anything that is not 'out' as incoming (green)", () => {
    expect(moneyTone("").className).toBe("text-success");
    expect(moneyTone("credit").isOut).toBe(false);
  });
});
