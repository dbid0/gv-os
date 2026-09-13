import { SHEET_FEE_RATES_BPS } from "@/lib/accounting/sheet-mirror";

/**
 * HOW MONEY ARRIVES, AND WHAT IT COSTS TO TAKE IT.
 *
 * The fee a deal carries is decided by its payment method, so the method
 * offered on the form has to match the vocabulary the fee table actually
 * knows. It did not: the live finance sheet records Fanbasis (now Commas),
 * Wire, Zelle and ACH, while the in-app form offered only Stripe, the
 * processor, Whop, Wire, PayPal, Cash and Other.
 *
 * Zelle and ACH therefore had to be logged as "Other", which falls through to
 * the 3% catch-all — a fee that does not exist on a bank transfer. On a
 * $10,000 wire that is $300 of phantom cost, taken straight out of net, in the
 * one flow the partners use for all of their own accounting precisely because
 * wires and Zelle never appear in a processor's API.
 *
 * Aliases matter for the same reason. Commas IS Fanbasis (same company, same
 * rail — Commas is the current name, Fanbasis the retired one), so a deal
 * logged under either name must carry Commas's 2.9% + $0.29 and count as ONE
 * processor. Shopify is retired but a form naming it still has to price
 * correctly.
 */

/** What a method costs, for grouping on the form. */
export type MethodKind = "processor" | "bank" | "manual";

export interface PaymentMethod {
  /** The value stored on the deal, and the key the fee table is read with. */
  name: string;
  kind: MethodKind;
  /** Shown beside the name so the fee is never a surprise. */
  note: string;
}

/**
 * Every method a deal can be logged under.
 *
 * Ordered by how often GV actually sees them, so the common case is the short
 * reach: Commas (formerly Fanbasis) and Wire are most of the book, Zelle and
 * ACH next.
 */
export const PAYMENT_METHODS: PaymentMethod[] = [
  { name: "Commas", kind: "processor", note: "2.9% + $0.29 · formerly Fanbasis" },
  { name: "Wire", kind: "bank", note: "no fee" },
  { name: "Zelle", kind: "bank", note: "no fee" },
  { name: "ACH", kind: "bank", note: "no fee" },
  { name: "Stripe", kind: "processor", note: "2.9%" },
  { name: "Whop", kind: "processor", note: "4.51%" },
  {
    name: "Shopify Affirm",
    kind: "processor",
    note: "2.9% · retired, kept for old deals",
  },
  { name: "PayPal", kind: "processor", note: "3.49%" },
  { name: "Card", kind: "processor", note: "2.9%" },
  { name: "Amex", kind: "processor", note: "2.9%" },
  { name: "Cash App", kind: "processor", note: "2.75%" },
  { name: "Venmo", kind: "processor", note: "1.9%" },
  { name: "Crypto", kind: "processor", note: "1.5%" },
  { name: "Wise", kind: "bank", note: "no fee" },
  { name: "Check / Cash", kind: "manual", note: "no fee" },
];

/**
 * Names that mean an existing method.
 *
 * Kept separate from the list above so the form shows one entry per real
 * method while a deal imported under any spelling still prices correctly.
 */
const ALIASES: Record<string, string> = {
  // Fanbasis is the retired name for Commas — same processor, same fee. Every
  // stored/imported "fanbasis" row resolves to the canonical "Commas".
  fanbasis: "Commas",
  shopify: "Shopify Affirm",
  "shopify payments": "Shopify Affirm",
  cash: "Check / Cash",
  check: "Check / Cash",
  "bank transfer": "Wire",
  "wire transfer": "Wire",
};

/** The canonical method name for whatever was typed or imported. */
export function canonicalMethod(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  const exact = PAYMENT_METHODS.find(
    (m) => m.name.toLowerCase() === value.toLowerCase(),
  );
  if (exact) return exact.name;
  return ALIASES[value.toLowerCase()] ?? null;
}

/**
 * Does the fee table price this method, or would it hit the catch-all?
 *
 * The catch-all exists to mirror the sheet's own formula and must stay. What
 * must not happen is a method GV uses every week falling into it silently, so
 * this is what the form uses to decide whether to warn.
 */
export function isPricedMethod(raw: string | null | undefined): boolean {
  const name = canonicalMethod(raw);
  return name !== null && SHEET_FEE_RATES_BPS[name] !== undefined;
}

/** Methods grouped for display: processors, then bank transfers, then manual. */
export function methodsByKind(): {
  kind: MethodKind;
  label: string;
  methods: PaymentMethod[];
}[] {
  return [
    {
      kind: "processor" as const,
      label: "Processors",
      methods: PAYMENT_METHODS.filter((m) => m.kind === "processor"),
    },
    {
      kind: "bank" as const,
      label: "Bank transfer — no fee",
      methods: PAYMENT_METHODS.filter((m) => m.kind === "bank"),
    },
    {
      kind: "manual" as const,
      label: "Manual",
      methods: PAYMENT_METHODS.filter((m) => m.kind === "manual"),
    },
  ].filter((g) => g.methods.length > 0);
}
