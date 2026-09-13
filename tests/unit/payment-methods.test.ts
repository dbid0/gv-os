import { describe, expect, it } from "vitest";

import {
  canonicalMethod,
  isPricedMethod,
  methodsByKind,
  PAYMENT_METHODS,
} from "@/lib/accounting/payment-methods";
import { sheetFeeCents } from "@/lib/accounting/sheet-mirror";

describe("the methods GV actually uses are all offered", () => {
  it("covers every method on the live finance sheet", () => {
    // Commas (formerly Fanbasis) 26, Wire 14, Zelle 5, ACH 4 — Zelle and ACH
    // had no entry on the form at all, so they had to be logged as "Other".
    for (const used of ["Commas", "Wire", "Zelle", "ACH"]) {
      expect(PAYMENT_METHODS.some((m) => m.name === used)).toBe(true);
    }
  });

  it("prices every offered method — none falls to the catch-all", () => {
    // A method on the form that the fee table does not know would charge the
    // 3% fallback silently.
    for (const m of PAYMENT_METHODS) {
      expect(isPricedMethod(m.name)).toBe(true);
    }
  });
});

describe("a bank transfer costs nothing", () => {
  it("charges NO fee on Zelle, ACH and Wire", () => {
    // The bug: logged as "Other", a $10,000 Zelle was charged $300 that does
    // not exist, straight out of net.
    for (const method of ["Zelle", "ACH", "Wire"]) {
      expect(sheetFeeCents(1_000_000, method, null)).toBe(0);
    }
  });

  it("shows what the wrong answer would have been", () => {
    // "Other" is not a known method, so it hits the 3% catch-all.
    expect(sheetFeeCents(1_000_000, "Other", null)).toBe(30_000);
  });
});

describe("aliases", () => {
  it("treats Fanbasis as Commas (Commas is canonical, Fanbasis the retired name)", () => {
    // Daniel: "commas are fanbasis" — same processor, one fee. Commas is now
    // the canonical method; a stored/imported "Fanbasis" must resolve to it.
    expect(canonicalMethod("Fanbasis")).toBe("Commas");
    expect(canonicalMethod("fanbasis")).toBe("Commas");
    // And a payment recorded under either name carries the identical fee.
    expect(sheetFeeCents(100_000, canonicalMethod("Fanbasis")!, null)).toBe(
      sheetFeeCents(100_000, "Commas", null),
    );
  });

  it("still prices Shopify, which is retired but appears on old deals", () => {
    expect(canonicalMethod("Shopify")).toBe("Shopify Affirm");
    expect(sheetFeeCents(100_000, canonicalMethod("Shopify")!, null)).toBe(2_900);
  });

  it("maps the ways a bank transfer gets written", () => {
    expect(canonicalMethod("wire transfer")).toBe("Wire");
    expect(canonicalMethod("Bank Transfer")).toBe("Wire");
    expect(canonicalMethod("Cash")).toBe("Check / Cash");
  });

  it("returns null for something genuinely unknown, rather than guessing", () => {
    expect(canonicalMethod("SomeNewProcessor")).toBeNull();
    expect(canonicalMethod("")).toBeNull();
    expect(canonicalMethod(null)).toBeNull();
    expect(isPricedMethod("SomeNewProcessor")).toBe(false);
  });

  it("is case and space insensitive", () => {
    expect(canonicalMethod("  fanbasis  ")).toBe("Commas");
    expect(canonicalMethod("ZELLE")).toBe("Zelle");
  });
});

describe("methodsByKind", () => {
  it("separates fee-free bank transfers from processors", () => {
    const groups = methodsByKind();
    const bank = groups.find((g) => g.kind === "bank")!;
    expect(bank.methods.map((m) => m.name)).toEqual(
      expect.arrayContaining(["Wire", "Zelle", "ACH"]),
    );
    expect(bank.label).toContain("no fee");
  });

  it("puts Commas first — it is most of the book", () => {
    expect(PAYMENT_METHODS[0].name).toBe("Commas");
    // The note keeps the retired name visible so old deals are recognizable.
    expect(PAYMENT_METHODS[0].note).toContain("Fanbasis");
  });
});
