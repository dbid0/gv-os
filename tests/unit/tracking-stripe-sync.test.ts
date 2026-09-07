import { describe, expect, it, vi } from "vitest";

import { fetchStripeCharges } from "@/lib/tracking/stripe-sync";

function page(ids: string[], hasMore: boolean) {
  return {
    ok: true,
    json: async () => ({
      data: ids.map((id) => ({ id, amount: 4900, created: 1_756_000_000 })),
      has_more: hasMore,
    }),
  } as unknown as Response;
}

describe("fetchStripeCharges", () => {
  it("follows the cursor until has_more is false", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page(["a", "b"], true))
      .mockResolvedValueOnce(page(["c"], false));

    const charges = await fetchStripeCharges("sk_test", new Date(0), fetchImpl);

    expect(charges.map((c) => c.id)).toEqual(["a", "b", "c"]);
    // The second request must resume AFTER the last id of the first page,
    // or pagination silently re-reads page one forever.
    expect(fetchImpl.mock.calls[1][0]).toContain("starting_after=b");
  });

  it("stops on an empty page even if Stripe claims there is more", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([], true));
    await expect(
      fetchStripeCharges("sk_test", new Date(0), fetchImpl),
    ).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends the window as unix SECONDS", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page(["a"], false));
    await fetchStripeCharges("sk_test", new Date("2026-08-01T00:00:00Z"), fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toContain(
      `created%5Bgte%5D=${Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000)}`,
    );
  });

  it("authorises with the key as a bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page(["a"], false));
    await fetchStripeCharges("sk_test_abc", new Date(0), fetchImpl);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer sk_test_abc");
  });

  it("THROWS on an error response instead of returning a partial total", async () => {
    // A 401 that resolved to [] would render as "$0 collected" — a wrong
    // number that looks like a real one.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Invalid API Key",
    } as unknown as Response);
    await expect(fetchStripeCharges("bad", new Date(0), fetchImpl)).rejects.toThrow(
      /401/,
    );
  });
});
