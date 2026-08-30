import { describe, expect, it } from "vitest";

import { generateShareToken } from "@/lib/workspace/share-token";

describe("generateShareToken", () => {
  it("is URL-safe: only base64url characters, no padding", () => {
    for (let i = 0; i < 200; i++) {
      const token = generateShareToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token).not.toContain("=");
      expect(token).not.toContain("+");
      expect(token).not.toContain("/");
    }
  });

  it("carries enough entropy to be unguessable (22 chars from 16 bytes)", () => {
    const token = generateShareToken();
    expect(token.length).toBeGreaterThanOrEqual(22);
  });

  it("is effectively unique across many generations", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateShareToken());
    expect(seen.size).toBe(5000);
  });
});
