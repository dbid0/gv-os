import { describe, expect, it } from "vitest";

import { parseEnv } from "@/env";

// The two Supabase values are required, so every case supplies them.
const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40),
};

describe("parseEnv", () => {
  it("applies defaults when nothing is set", () => {
    const env = parseEnv({ ...REQUIRED });

    expect(env.NODE_ENV).toBe("development");
    expect(env.NEXT_PUBLIC_APP_ENV).toBe("local");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("accepts a valid production configuration", () => {
    const env = parseEnv({
      ...REQUIRED,
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://gv-os.vercel.app",
    });

    expect(env.NEXT_PUBLIC_APP_ENV).toBe("production");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://gv-os.vercel.app");
  });

  it("rejects a malformed app URL", () => {
    expect(() => parseEnv({ ...REQUIRED, NEXT_PUBLIC_APP_URL: "not-a-url" })).toThrow(
      /NEXT_PUBLIC_APP_URL/,
    );
  });

  it("rejects an unknown app environment", () => {
    expect(() => parseEnv({ ...REQUIRED, NEXT_PUBLIC_APP_ENV: "staging" })).toThrow(
      /NEXT_PUBLIC_APP_ENV/,
    );
  });

  it("reports a root-level failure when handed something that is not an object", () => {
    expect(() => parseEnv("nope" as unknown as NodeJS.ProcessEnv)).toThrow(/\(root\)/);
  });

  it("reports every invalid key at once, not just the first", () => {
    expect(() =>
      parseEnv({
        ...REQUIRED,
        NEXT_PUBLIC_APP_ENV: "nope",
        NEXT_PUBLIC_APP_URL: "nope",
      }),
    ).toThrow(/NEXT_PUBLIC_APP_ENV[\s\S]*NEXT_PUBLIC_APP_URL/);
  });
});
