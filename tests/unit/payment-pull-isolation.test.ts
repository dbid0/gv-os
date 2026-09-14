/**
 * @vitest-environment node
 *
 * pullStripeEvents must isolate each connection the way every other pull does
 * (Calendly/iClosed in bookings/capture, Close, Kit, Typeform/PandaDoc): one
 * dead Stripe key records a per-connection failure note and the loop keeps
 * going, instead of throwing out of the whole run and starving every later
 * connection. Masked today only because Grid is the sole Stripe connection —
 * this proves it holds the moment a second client's Stripe connects.
 *
 * The loop is what's under test, so its collaborators (vault open, the
 * normalizer, and fetch) are mocked; the DB is a thin fake that records the
 * sync-note writes in order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedPayment } from "@/lib/payments/normalize";

// Shared mock state. Declared through vi.hoisted so the (also-hoisted) vi.mock
// factories below may safely reference it.
const { CONNECTIONS, setCalls } = vi.hoisted(() => ({
  // The connections the fake DB hands back, reset per test.
  CONNECTIONS: [] as { id: string; clientId: string | null; secretBox: string }[],
  // Every integrations.update(...).set(payload) the loop performs, in order.
  setCalls: [] as { payload: Record<string, unknown> }[],
}));

vi.mock("@/env.server", () => ({
  serverEnv: () => ({ CREDENTIALS_KEY: "unit-test-vault-key" }),
}));

vi.mock("@/lib/crypto/secretbox", () => ({
  // Identity open — the sealed box is irrelevant to loop isolation.
  open: (box: string) => box,
}));

vi.mock("@/lib/payments/normalize", () => {
  const normalized: NormalizedPayment = {
    externalId: "evt",
    kind: "charge",
    amountCents: 1000,
    currency: "usd",
    email: null,
    occurredAt: null,
    label: "charge.succeeded",
    failureCode: null,
    failureMessage: null,
    customerRef: null,
  };
  // Every event is a captureable charge; the loop, not the normalizer, is
  // what these tests exercise.
  return {
    normalizeStripe: () => normalized,
    normalizePayment: () => normalized,
  };
});

vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ where: () => Promise.resolve(CONNECTIONS) }),
    }),
    // capturePayment's insert path — always "inserted", so a captured event
    // is counted.
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([{ id: "row" }]),
        }),
      }),
    }),
    update: () => ({
      set: (payload: Record<string, unknown>) => ({
        where: () => {
          setCalls.push({ payload });
          return Promise.resolve();
        },
      }),
    }),
  }),
}));

// Imported after the mocks are registered so the module under test picks them up.
const { pullStripeEvents } = await import("@/lib/payments/capture");

beforeEach(() => {
  CONNECTIONS.length = 0;
  setCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pullStripeEvents per-connection isolation", () => {
  it("keeps pulling later connections after one throws, and notes the failure", async () => {
    CONNECTIONS.push(
      { id: "conn-a-dead", clientId: "client-a", secretBox: "box-a" },
      { id: "conn-b-live", clientId: "client-b", secretBox: "box-b" },
    );

    // A's key is dead (401); B is healthy and returns two events.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Invalid API Key provided",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "evt_1" }, { id: "evt_2" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const results = await pullStripeEvents();

    // The dead connection did NOT abort the run — B was still fetched.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Two connections, two sync-note writes: A's failure, then B's success.
    expect(setCalls).toHaveLength(2);

    // A: a failure note, and lastSyncAt is NOT advanced (it means last SUCCESS).
    const aSet = setCalls[0].payload;
    expect(String(aSet.lastSyncNote)).toMatch(/^sync failed: /);
    expect(aSet.lastSyncAt).toBeUndefined();

    // B: a healthy note, and lastSyncAt advanced exactly as before.
    const bSet = setCalls[1].payload;
    expect(bSet.lastSyncNote).toBe("pulled 2, captured 2 new");
    expect(bSet.lastSyncAt).toBeInstanceOf(Date);

    // Return shape mirrors the other pulls: A carries an error, B carries counts.
    const byId = new Map(results.map((r) => [r.integrationId, r]));
    expect(byId.get("conn-a-dead")?.error).toMatch(/^sync failed: /);
    expect(byId.get("conn-a-dead")?.fetched).toBeUndefined();
    expect(byId.get("conn-b-live")).toMatchObject({ fetched: 2, captured: 2 });
  });

  it("a healthy connection advances lastSyncAt and records its note unchanged", async () => {
    CONNECTIONS.push({
      id: "conn-grid",
      clientId: "client-grid",
      secretBox: "box-grid",
    });

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "evt_1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await pullStripeEvents();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setCalls).toHaveLength(1);
    const set = setCalls[0].payload;
    expect(set.lastSyncNote).toBe("pulled 1, captured 1 new");
    expect(set.lastSyncAt).toBeInstanceOf(Date);
    expect(results).toEqual([{ integrationId: "conn-grid", fetched: 1, captured: 1 }]);
  });
});
