/**
 * MCP API keys — generation, hashing and bearer parsing.
 *
 * A key is `gvos_mcp_` followed by 32 random bytes in base64url. Only the
 * SHA-256 of the full key is ever stored; the first 16 characters are kept as
 * a non-secret label so an owner can tell keys apart in the list. Comparison
 * happens on hashes, so the stored value is never a usable credential.
 *
 * Pure apart from the injected random source (default: node crypto).
 */

import { createHash, randomBytes } from "node:crypto";

export const KEY_PREFIX = "gvos_mcp_";
const KEY_SHAPE = /^gvos_mcp_[A-Za-z0-9_-]{43}$/;

export function generateKey(random: (n: number) => Buffer = randomBytes): string {
  return KEY_PREFIX + random(32).toString("base64url");
}

export function isKeyShape(key: string): boolean {
  return KEY_SHAPE.test(key);
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** The non-secret label shown in the key list: "gvos_mcp_AbC1dE2f". */
export function keyLabel(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 8);
}

/** The key from an `Authorization: Bearer …` header, or null if absent/malformed. */
export function bearerKey(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/.exec(header.trim());
  if (!match) return null;
  return isKeyShape(match[1]) ? match[1] : null;
}
