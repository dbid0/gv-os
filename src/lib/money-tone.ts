/**
 * One rule for the color of money on screen: cash IN reads green, cash OUT
 * reads red — the accounting convention, applied consistently everywhere a
 * direction is shown so the eye never has to think about it. Pure, so it is
 * trivially testable and safe to import anywhere (server or client).
 */

export interface MoneyTone {
  isOut: boolean;
  /** Tailwind text color class for the amount. */
  className: string;
}

export function moneyTone(direction: string): MoneyTone {
  const isOut = direction === "out";
  return { isOut, className: isOut ? "text-destructive" : "text-success" };
}
