/**
 * Money.
 *
 * Every monetary value in GV OS is an integer number of CENTS. Never a float,
 * never a dollar amount in a variable, never `parseFloat`.
 *
 * Why this file is paranoid: `parseFloat("0.29") * 100` is 28.999999999999996.
 * Round that the wrong way once, on the wrong row, and a payout is off by a
 * cent. Do it across a month of Fanbasis fees and the reconciliation stops
 * tying out. So dollar strings are parsed with STRING math, not arithmetic.
 *
 * Safe range: cents up to Number.MAX_SAFE_INTEGER is about $90 trillion. Every
 * constructor asserts the value is a safe integer, so an overflow throws rather
 * than silently losing precision.
 */

declare const CENTS: unique symbol;

/**
 * A signed integer count of cents. Branded so a plain number cannot be passed
 * where money is expected without going through a checked constructor.
 */
export type Cents = number & { readonly [CENTS]: true };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Wraps an integer count of cents, asserting it is actually safe to use. */
export function cents(value: number): Cents {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`cents must be finite, received ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `cents must be a whole number, received ${value}. Money is never fractional cents.`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`cents ${value} exceeds the safe integer range`);
  }
  return value as Cents;
}

export const ZERO = cents(0);

const DOLLARS_PATTERN = /^(-)?\$?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a dollar string or whole-dollar number into cents, using string math.
 *
 * Accepts "1358.98", "$1,358.98", "-$5", "0.29". Rejects anything with more
 * than two decimal places rather than rounding it, because silently discarding
 * a third decimal is how a number becomes subtly wrong.
 */
export function fromDollars(input: string | number): Cents {
  const raw = typeof input === "number" ? formatNumberInput(input) : input.trim();

  const match = DOLLARS_PATTERN.exec(raw);
  if (!match) {
    throw new MoneyError(
      `"${raw}" is not a valid dollar amount. Expected something like 1358.98, $1,358.98, or -5.`,
    );
  }

  const [, sign, whole, fraction = ""] = match;
  const digits = `${whole.replaceAll(",", "")}${fraction.padEnd(2, "0")}`;
  const value = Number(digits);

  return cents(sign === "-" ? -value : value);
}

function formatNumberInput(value: number): string {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`"${String(value)}" is not a valid dollar amount.`);
  }
  // A float here is already suspect, so only whole dollars are accepted from a
  // number. Anything with decimals must arrive as a string.
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `fromDollars received the float ${value}. Pass a string like "${value.toFixed(2)}" so no precision is lost.`,
    );
  }
  return String(value);
}

/** Exact addition. */
export function add(...amounts: Cents[]): Cents {
  return cents(amounts.reduce<number>((total, amount) => total + amount, 0));
}

/** Exact subtraction: a minus b. */
export function subtract(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function negate(amount: Cents): Cents {
  return cents(-amount);
}

export function sum(amounts: readonly Cents[]): Cents {
  return cents(amounts.reduce<number>((total, amount) => total + amount, 0));
}

/**
 * Applies a rate given in basis points (10000 bps = 100%), rounding half away
 * from zero so +0.5 and -0.5 round symmetrically. Used for processor fees.
 */
export function applyBps(amount: Cents, bps: number): Cents {
  if (!Number.isInteger(bps)) {
    throw new MoneyError(`basis points must be a whole number, received ${bps}`);
  }
  const exact = (amount * bps) / 10_000;
  const rounded = Math.sign(exact) * Math.round(Math.abs(exact));
  // Math.round(-0.5) is -0, which is a real value in JS. Normalise it.
  return cents(rounded === 0 ? 0 : rounded);
}

/** Formats for display only. Never feed the result back into arithmetic. */
export function formatUSD(amount: Cents): string {
  const negative = amount < 0;
  const absolute = Math.abs(amount);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  const grouped = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}$${grouped}.${fraction}`;
}

/** Display-only conversion, for chart libraries that demand a float. */
export function toDollarsNumber(amount: Cents): number {
  return amount / 100;
}
