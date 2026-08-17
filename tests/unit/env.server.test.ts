import { afterEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/env.server";

describe("parseServerEnv", () => {
  it("accepts a postgres connection string", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgresql://user:pw@host:5432/postgres",
    });

    expect(env.DATABASE_URL).toBe("postgresql://user:pw@host:5432/postgres");
  });

  it("accepts the postgres:// scheme too", () => {
    const env = parseServerEnv({ DATABASE_URL: "postgres://user:pw@host:5432/db" });

    expect(env.DATABASE_URL).toBe("postgres://user:pw@host:5432/db");
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects an empty DATABASE_URL", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "" })).toThrow(/required/);
  });

  it("rejects a connection string with the wrong scheme", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://user:pw@host/db" })).toThrow(
      /postgres:\/\/ or postgresql:\/\//,
    );
  });

  it("reports a root-level failure when handed something that is not an object", () => {
    expect(() => parseServerEnv("nope" as unknown as NodeJS.ProcessEnv)).toThrow(
      /\(root\)/,
    );
  });
});

describe("serverEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reads process.env on first use and memoizes the result", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pw@host:5432/db");

    // Fresh module instance so the module-level cache starts empty.
    const { serverEnv } = await import("@/env.server");

    const first = serverEnv();
    const second = serverEnv();

    expect(first.DATABASE_URL).toBe("postgresql://user:pw@host:5432/db");
    // Same object identity proves the second call did not re-parse.
    expect(second).toBe(first);
  });

  it("throws when the environment is invalid", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const { serverEnv } = await import("@/env.server");

    expect(() => serverEnv()).toThrow(/DATABASE_URL/);
  });
});
