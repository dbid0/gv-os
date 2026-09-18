import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TIMEOUT_MS,
  isTimeoutError,
  timeoutFetch,
} from "@/lib/net/timeout-fetch";

/** What the stubbed fetch was handed, for the two tests that check init. */
let seen: RequestInit | undefined;

afterEach(() => {
  vi.unstubAllGlobals();
  seen = undefined;
});

/** The DOMException-shaped error an aborted fetch actually throws. */
const abortError = (name: "TimeoutError" | "AbortError") => {
  const e = new Error("signal is aborted without reason");
  e.name = name;
  return e;
};

describe("isTimeoutError", () => {
  it("recognises both shapes an abort arrives as", () => {
    expect(isTimeoutError(abortError("TimeoutError"))).toBe(true);
    expect(isTimeoutError(abortError("AbortError"))).toBe(true);
  });

  it("does not claim an ordinary failure was a timeout", () => {
    expect(isTimeoutError(new Error("ECONNREFUSED"))).toBe(false);
    expect(isTimeoutError("not an error")).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});

describe("timeoutFetch", () => {
  it("passes the response straight through when the host answers", async () => {
    const res = new Response("ok");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res),
    );
    expect(await timeoutFetch("https://api.example.test/x")).toBe(res);
  });

  it("always attaches a signal, even when the caller passed none", async () => {
    const spy = vi.fn(async (_url: string, init?: RequestInit) => {
      void _url;
      seen = init;
      return new Response("ok");
    });
    vi.stubGlobal("fetch", spy);
    await timeoutFetch("https://api.example.test/x");
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the caller's own headers and method", async () => {
    const spy = vi.fn(async (_url: string, init?: RequestInit) => {
      void _url;
      seen = init;
      return new Response("ok");
    });
    vi.stubGlobal("fetch", spy);
    await timeoutFetch("https://api.example.test/x", {
      method: "POST",
      headers: { Authorization: "Bearer k" },
    });
    expect(seen).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer k" },
    });
  });

  it("turns an abort into a readable error naming the host and the budget", async () => {
    // The raw abort says "signal is aborted without reason", which would land
    // verbatim in an integration's sync note and tell the reader nothing.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw abortError("TimeoutError");
      }),
    );
    await expect(
      timeoutFetch("https://sheets.googleapis.com/v4/spreadsheets/x", {}, 8000),
    ).rejects.toThrow("sheets.googleapis.com did not respond within 8s.");
  });

  it("never puts the URL in the message — it can carry a key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw abortError("TimeoutError");
      }),
    );
    await expect(
      timeoutFetch("https://api.example.test/feed?token=super-secret"),
    ).rejects.toThrow(/^api\.example\.test did not respond within \d+s\.$/);
  });

  it("stays vague rather than wrong when the URL will not parse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw abortError("AbortError");
      }),
    );
    await expect(timeoutFetch("not-a-url")).rejects.toThrow(
      /^The provider did not respond within/,
    );
  });

  it("passes a real failure through untouched", async () => {
    // A refused connection is not a timeout and must not be relabelled as one.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(timeoutFetch("https://api.example.test/x")).rejects.toThrow(
      "ECONNREFUSED",
    );
  });

  it("defaults to a budget that a slow but healthy call survives", () => {
    // A guard against hanging, not a latency budget.
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
  });
});
