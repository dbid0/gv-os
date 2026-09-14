import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mcpApiKeys } from "@/db/schema/app";
import { generateKey, hashKey, keyLabel } from "@/lib/mcp/keys";

export type McpKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdBy: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

/**
 * Create a key. Returns the full key ONCE — it is never stored or shown again;
 * only its hash and its non-secret label persist.
 */
export async function createMcpKey(
  name: string,
  createdBy: string | null,
): Promise<{ id: string; key: string }> {
  const key = generateKey();
  const db = getDb();
  const [row] = await db
    .insert(mcpApiKeys)
    .values({
      name: name.trim(),
      keyPrefix: keyLabel(key),
      keyHash: hashKey(key),
      createdBy,
    })
    .returning({ id: mcpApiKeys.id });
  return { id: row.id, key };
}

export async function listMcpKeys(): Promise<McpKeyRow[]> {
  const db = getDb();
  return db
    .select({
      id: mcpApiKeys.id,
      name: mcpApiKeys.name,
      keyPrefix: mcpApiKeys.keyPrefix,
      scopes: mcpApiKeys.scopes,
      createdBy: mcpApiKeys.createdBy,
      createdAt: mcpApiKeys.createdAt,
      lastUsedAt: mcpApiKeys.lastUsedAt,
      revokedAt: mcpApiKeys.revokedAt,
    })
    .from(mcpApiKeys)
    .orderBy(desc(mcpApiKeys.createdAt));
}

export async function revokeMcpKey(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(mcpApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpApiKeys.id, id), isNull(mcpApiKeys.revokedAt)))
    .returning({ id: mcpApiKeys.id });
  return rows.length > 0;
}

/**
 * The active key matching a presented key, by hash. Revoked keys never match.
 * Stamps last-used (best effort — a failed stamp never refuses a valid key).
 */
export async function authenticateMcpKey(
  key: string,
): Promise<{ id: string; scopes: string[] } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: mcpApiKeys.id, scopes: mcpApiKeys.scopes })
    .from(mcpApiKeys)
    .where(and(eq(mcpApiKeys.keyHash, hashKey(key)), isNull(mcpApiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  await db
    .update(mcpApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpApiKeys.id, row.id))
    .catch(() => undefined);
  return row;
}
