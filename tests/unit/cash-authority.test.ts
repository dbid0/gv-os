import { describe, expect, it } from "vitest";

import {
  formOwnsCash,
  normalizeCashAuthority,
  resolveCashAuthority,
} from "@/lib/sources/cash-authority";

describe("normalizeCashAuthority", () => {
  it("keeps valid settings and defaults anything else to auto", () => {
    expect(normalizeCashAuthority("forms")).toBe("forms");
    expect(normalizeCashAuthority("processors")).toBe("processors");
    expect(normalizeCashAuthority("auto")).toBe("auto");
    expect(normalizeCashAuthority(null)).toBe("auto");
    expect(normalizeCashAuthority("garbage")).toBe("auto");
    expect(normalizeCashAuthority(undefined)).toBe("auto");
  });
});

describe("resolveCashAuthority", () => {
  it("honors an explicit override regardless of processors", () => {
    expect(resolveCashAuthority("forms", true)).toBe("forms");
    expect(resolveCashAuthority("forms", false)).toBe("forms");
    expect(resolveCashAuthority("processors", false)).toBe("processors");
    expect(resolveCashAuthority("processors", true)).toBe("processors");
  });

  it("auto derives from whether a processor is connected", () => {
    expect(resolveCashAuthority("auto", false)).toBe("forms");
    expect(resolveCashAuthority("auto", true)).toBe("processors");
  });
});

describe("formOwnsCash", () => {
  it("is true exactly when the resolved authority is the form", () => {
    // Default offer, no processor yet -> the form owns the cash.
    expect(formOwnsCash("auto", false)).toBe(true);
    // First processor connects -> processors own it, form is deals-only.
    expect(formOwnsCash("auto", true)).toBe(false);
    // Explicit pins override the processor state either way.
    expect(formOwnsCash("forms", true)).toBe(true);
    expect(formOwnsCash("processors", false)).toBe(false);
  });
});
