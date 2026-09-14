/**
 * The words a payment row carries about ITSELF — what was bought, who processed
 * it, and whether it was a charge or a refund — read the same way whichever
 * system wrote the row.
 *
 * A processor snapshot writes lowercase machine keys (`processor`, `kind`) and
 * puts the charge description in `notes`; a hand-kept tracking sheet uses its
 * own headers ("Product", "Processor", "Offer"…). Tag rules match against these
 * three words, so they have to mean the same thing across both feeds or a rule
 * written against one would silently miss the other.
 *
 * Pure: no I/O. Unknown stays null — never a guessed label.
 */

import { classifyPayment } from "@/lib/tracking/refunds";

/** Sheet headers that name what a payment bought, in preference order. */
const LABEL_HEADERS = [
  "Product",
  "Offer",
  "Program",
  "Program Sold",
  "Plan",
  "Item",
  "Description",
] as const;

const text = (v: string | undefined | null): string | null => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

/** What the payment was for: a named product header, else the row's note. */
export function paymentLabel(
  payload: Record<string, string> | null | undefined,
  notes: string | null,
): string | null {
  for (const header of LABEL_HEADERS) {
    const hit = text(payload?.[header]);
    if (hit) return hit;
  }
  return text(notes);
}

/** Who processed it: the row's own processor word, else the feed's source. */
export function paymentProvider(
  payload: Record<string, string> | null | undefined,
  source: string | null,
): string | null {
  return text(payload?.["Processor"]) ?? text(payload?.["processor"]) ?? text(source);
}

/**
 * charge · refund · failed. A processor's explicit `kind` wins; otherwise the
 * same refund/failure reading the cash figures already use decides, so a rule
 * on kind can never disagree with how the money was counted.
 */
export function paymentKind(
  payload: Record<string, string> | null | undefined,
  cashCents: number | null,
  status: string | null,
): string {
  const explicit = text(payload?.["kind"]);
  if (explicit) return explicit.toLowerCase();
  const outcome = classifyPayment({ cashCents, status });
  if (outcome === "refunded") return "refund";
  if (outcome === "failed") return "failed";
  return "charge";
}
