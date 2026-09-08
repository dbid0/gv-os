import { describe, expect, it } from "vitest";

import { cashMix, type MixPayment } from "@/lib/tracking/cash-mix";

const pay = (
  email: string | null,
  cents: number,
  iso: string,
  over: Partial<MixPayment> = {},
): MixPayment => ({
  email,
  cashCents: cents,
  status: "succeeded",
  occurredAt: new Date(iso),
  ...over,
});

const AUG = [
  new Date("2026-08-01T00:00:00Z"),
  new Date("2026-08-31T23:59:59Z"),
] as const;

describe("cashMix", () => {
  it("a payer's first-ever payment is NEW", () => {
    const mix = cashMix([pay("a@x.com", 4900, "2026-08-10T12:00:00Z")], ...AUG);
    expect(mix.newCents).toBe(4900);
    expect(mix.newPayers).toBe(1);
  });

  it("a second payment inside the first month is RECURRING SAME-MONTH", () => {
    const mix = cashMix(
      [
        pay("a@x.com", 99700, "2026-08-05T12:00:00Z"),
        pay("a@x.com", 250000, "2026-08-20T12:00:00Z"), // upsold same month
      ],
      ...AUG,
    );
    expect(mix.newCents).toBe(99_700);
    expect(mix.recurringSameMonthCents).toBe(250_000);
  });

  it("a renewal from an earlier-month payer is AFTER-THE-1st-MONTH — retention made visible", () => {
    // The $49 sub: first paid in July, renewed in August. The August window
    // must call that retention, not new cash.
    const mix = cashMix(
      [
        pay("sub@x.com", 4900, "2026-07-06T12:00:00Z"),
        pay("sub@x.com", 4900, "2026-08-06T12:00:00Z"),
      ],
      ...AUG,
    );
    expect(mix.newCents).toBe(0);
    expect(mix.afterFirstMonthCents).toBe(4900);
    expect(mix.returningPayers).toBe(1);
  });

  it("first-payment lookup uses history OUTSIDE the window", () => {
    // Without full history, the August renewal would masquerade as new.
    const julyOnly = cashMix([pay("sub@x.com", 4900, "2026-08-06T12:00:00Z")], ...AUG);
    expect(julyOnly.newCents).toBe(4900); // no history → honestly reads as new
  });

  it("matches a payer by phone when the email is missing", () => {
    const mix = cashMix(
      [
        pay(null, 4900, "2026-07-06T12:00:00Z", { phone: "+1 (555) 010-2030" }),
        pay(null, 4900, "2026-08-06T12:00:00Z", { phone: "5550102030" }),
      ],
      ...AUG,
    );
    expect(mix.afterFirstMonthCents).toBe(4900);
  });

  it("identity-less or undated cash lands in UNPLACEABLE, never guessed", () => {
    const mix = cashMix([pay(null, 9900, "2026-08-10T12:00:00Z")], ...AUG);
    expect(mix.unplaceableCents).toBe(9900);
    expect(mix.newCents).toBe(0);
  });

  it("refunds and failed charges enter no bucket", () => {
    const mix = cashMix(
      [
        pay("a@x.com", 4900, "2026-08-10T12:00:00Z", { status: "refunded" }),
        pay("b@x.com", 4900, "2026-08-11T12:00:00Z", { status: "failed" }),
      ],
      ...AUG,
    );
    expect(mix.newCents + mix.recurringSameMonthCents + mix.afterFirstMonthCents).toBe(
      0,
    );
  });

  it("payments outside the window shape firsts but add no cents", () => {
    const mix = cashMix(
      [
        pay("a@x.com", 100_000, "2026-06-10T12:00:00Z"),
        pay("a@x.com", 50_000, "2026-08-10T12:00:00Z"),
      ],
      ...AUG,
    );
    expect(mix.newCents).toBe(0);
    expect(mix.afterFirstMonthCents).toBe(50_000);
  });
});
