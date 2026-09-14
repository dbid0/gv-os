import { describe, expect, it } from "vitest";

import {
  paymentKind,
  paymentLabel,
  paymentProvider,
} from "@/lib/tracking/payment-fields";
import { topValues } from "@/lib/tracking/tag-rules-panel-values";

describe("paymentLabel", () => {
  it("prefers a named product header over the row note", () => {
    expect(paymentLabel({ Product: " Core Program " }, "charge note")).toBe(
      "Core Program",
    );
  });

  it("walks the headers in preference order", () => {
    expect(paymentLabel({ Description: "desc", Offer: "offer" }, null)).toBe("offer");
    expect(paymentLabel({ "Program Sold": "sold" }, null)).toBe("sold");
  });

  it("falls back to the note, then null — never a guess", () => {
    expect(paymentLabel({ Product: "   " }, "Stripe description")).toBe(
      "Stripe description",
    );
    expect(paymentLabel(null, "  ")).toBeNull();
    expect(paymentLabel(undefined, null)).toBeNull();
  });
});

describe("paymentProvider", () => {
  it("reads the sheet header, then the processor key, then the feed source", () => {
    expect(paymentProvider({ Processor: "Commas" }, "sheet")).toBe("Commas");
    expect(paymentProvider({ processor: "Stripe" }, "stripe")).toBe("Stripe");
    expect(paymentProvider({}, "sheet")).toBe("sheet");
    expect(paymentProvider(null, null)).toBeNull();
  });
});

describe("paymentKind", () => {
  it("trusts an explicit processor kind", () => {
    expect(paymentKind({ kind: "Refund" }, 500, "succeeded")).toBe("refund");
  });

  it("otherwise reads the same refund/failure words the cash figures use", () => {
    expect(paymentKind({}, 500, "refunded")).toBe("refund");
    expect(paymentKind({}, -500, null)).toBe("refund");
    expect(paymentKind(null, 500, "failed")).toBe("failed");
    expect(paymentKind(undefined, 500, "succeeded")).toBe("charge");
  });
});

describe("topValues", () => {
  it("counts case-insensitively, keeps the first spelling, sorts by count then name", () => {
    expect(
      topValues([
        "Stripe",
        "stripe",
        "Commas",
        null,
        "  ",
        "Apple",
        "STRIPE",
        undefined,
      ]),
    ).toEqual([
      { value: "Stripe", count: 3 },
      { value: "Apple", count: 1 },
      { value: "Commas", count: 1 },
    ]);
  });

  it("honours the limit", () => {
    expect(topValues(["a", "b", "c"], 2)).toHaveLength(2);
  });
});
