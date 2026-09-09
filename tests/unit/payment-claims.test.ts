import { describe, expect, it } from "vitest";

import {
  isClaimRole,
  validateClaim,
  type ClaimValidationInput,
} from "@/lib/payments/claims";

function input(extra: Partial<ClaimValidationInput> = {}): ClaimValidationInput {
  return {
    role: "closer",
    rateOverrideBps: null,
    paymentClientId: "client-a",
    repClientId: "client-a",
    ...extra,
  };
}

describe("isClaimRole", () => {
  it("accepts the three seats and nothing else", () => {
    expect(isClaimRole("setter")).toBe(true);
    expect(isClaimRole("closer")).toBe(true);
    expect(isClaimRole("dm_setter")).toBe(true);
    expect(isClaimRole("manager")).toBe(false);
    expect(isClaimRole("")).toBe(false);
  });
});

describe("validateClaim", () => {
  it("accepts a clean claim", () => {
    expect(validateClaim(input())).toEqual({ ok: true, role: "closer" });
  });

  it("rejects an unknown seat", () => {
    const v = validateClaim(input({ role: "vibes" }));
    expect(v.ok).toBe(false);
  });

  it("cross-offer claims are refused — a rep cannot claim another offer's cash", () => {
    const v = validateClaim(input({ repClientId: "client-b" }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/different offer/);
  });

  it("agency-level payments cannot be claimed", () => {
    const v = validateClaim(input({ paymentClientId: null }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/[Aa]gency/);
  });

  it("rate overrides must be whole basis points in [0, 10000] — never clamped", () => {
    expect(validateClaim(input({ rateOverrideBps: 0 })).ok).toBe(true);
    expect(validateClaim(input({ rateOverrideBps: 2500 })).ok).toBe(true);
    expect(validateClaim(input({ rateOverrideBps: 10000 })).ok).toBe(true);
    expect(validateClaim(input({ rateOverrideBps: 10001 })).ok).toBe(false);
    expect(validateClaim(input({ rateOverrideBps: -1 })).ok).toBe(false);
    expect(validateClaim(input({ rateOverrideBps: 12.5 })).ok).toBe(false);
  });

  it("null override means the rules decide — allowed", () => {
    expect(validateClaim(input({ rateOverrideBps: null })).ok).toBe(true);
  });
});
