import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { open, seal, secretHint } from "@/lib/crypto/secretbox";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");

describe("secretbox seal/open", () => {
  it("round-trips a secret exactly", () => {
    const secret = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";
    expect(open(seal(secret, KEY), KEY)).toBe(secret);
  });

  it("round-trips unicode and long secrets", () => {
    const secret = "ключ-🔑-".repeat(200);
    expect(open(seal(secret, KEY), KEY)).toBe(secret);
  });

  it("produces different ciphertext for the same secret (fresh IV each time)", () => {
    expect(seal("same", KEY)).not.toBe(seal("same", KEY));
  });

  it("emits the versioned 4-part format", () => {
    const box = seal("x", KEY);
    expect(box.split(".")).toHaveLength(4);
    expect(box.startsWith("v1.")).toBe(true);
  });

  it("refuses to seal an empty secret", () => {
    expect(() => seal("", KEY)).toThrow(/empty secret/);
  });

  it("fails loudly on the wrong key", () => {
    const box = seal("secret", KEY);
    expect(() => open(box, OTHER_KEY)).toThrow(/wrong key or tampered/);
  });

  it("fails loudly when the ciphertext is tampered with", () => {
    const box = seal("secret", KEY);
    const parts = box.split(".");
    const ct = Buffer.from(parts[3], "base64");
    ct[0] ^= 0xff;
    parts[3] = ct.toString("base64");
    expect(() => open(parts.join("."), KEY)).toThrow(/wrong key or tampered/);
  });

  it("rejects an unrecognized format", () => {
    expect(() => open("v2.a.b.c", KEY)).toThrow(/Unrecognized/);
    expect(() => open("not-a-box", KEY)).toThrow(/Unrecognized/);
  });

  it("rejects keys that are not 32 bytes", () => {
    const short = randomBytes(16).toString("base64");
    expect(() => seal("x", short)).toThrow(/32 bytes, got 16/);
    expect(() => open(seal("x", KEY), short)).toThrow(/32 bytes/);
  });
});

describe("secretHint", () => {
  it("keeps only the last four characters", () => {
    expect(secretHint("sk_live_abcd1234")).toBe("…1234");
  });

  it("never reveals more than it should on short secrets", () => {
    expect(secretHint("abc")).toBe("…abc");
  });
});
