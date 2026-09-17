/**
 * LOW-TICKET vs HIGH-TICKET CASH.
 *
 * An offer that sells a $49 subscription alongside a $5,000 program has two
 * businesses in one cash figure. Counting them together makes the funnel read
 * as if hundreds of people bought the thing the sales team sells, and drags
 * average order value toward the subscription price.
 *
 * So cash splits at a threshold the OFFER sets. It is per-offer data, not a
 * constant: $49 is one offer's low-ticket line and would be meaningless for
 * another, and baking it into code would mean shipping an engineer every time
 * a price changes.
 *
 * UNSET MEANS NO SPLIT. An offer with no threshold does not get a guessed one
 * — it reports a single undivided figure, and the surfaces show no split at
 * all. A guessed line is worse than no line, because a wrong split still looks
 * like an answer.
 *
 * The boundary is INCLUSIVE of the threshold: "low ticket is anything up to
 * $49" is how a human states it, so a payment of exactly $49 is low ticket.
 *
 * Refunds and hidden payments never reach here — this splits whatever cash the
 * catalog already decided to count.
 *
 * Pure: no database, no clock, integer cents.
 */

export interface TicketPayment {
  cashCents: number;
}

export interface TicketBand {
  cents: number;
  count: number;
}

export interface TicketSplit {
  /** At or below the offer's threshold. */
  low: TicketBand;
  /** Above it. */
  high: TicketBand;
  /** The line this was split at, echoed so a surface can name it. */
  thresholdCents: number;
}

/**
 * Split counted cash at the offer's low-ticket line.
 *
 * Returns null when the offer has not set one — the caller then shows a single
 * figure rather than inventing a division.
 */
export function ticketSplit(
  payments: TicketPayment[],
  thresholdCents: number | null | undefined,
): TicketSplit | null {
  if (thresholdCents === null || thresholdCents === undefined) return null;
  // A threshold of 0 would put every sale in "high" and is how an unset field
  // arrives when something coerces it; treat it as unset rather than as a
  // meaningful line at zero dollars.
  if (thresholdCents <= 0) return null;

  const low: TicketBand = { cents: 0, count: 0 };
  const high: TicketBand = { cents: 0, count: 0 };

  for (const p of payments) {
    const band = p.cashCents <= thresholdCents ? low : high;
    band.cents += p.cashCents;
    band.count += 1;
  }

  return { low, high, thresholdCents };
}
