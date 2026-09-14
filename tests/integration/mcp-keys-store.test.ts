/**
 * @vitest-environment node
 *
 * MCP API keys against a real Postgres: only the hash is stored (never the
 * key), a presented key authenticates by hash and stamps last-used, a revoked
 * key stops authenticating at once, and the database refuses any scope beyond
 * read and any hash that isn't a SHA-256.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { hashKey } from "@/lib/mcp/keys";
import {
  authenticateMcpKey,
  createMcpKey,
  listMcpKeys,
  revokeMcpKey,
} from "@/lib/mcp/keys-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("MCP keys store", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  it("stores only the hash and a non-secret label", async () => {
    const { id, key } = await createMcpKey("  test laptop  ", "admin@example.com");
    const [row] = await sql<
      { name: string; key_prefix: string; key_hash: string; scopes: string[] }[]
    >`
      select name, key_prefix, key_hash, scopes from app.mcp_api_keys where id = ${id}`;
    expect(row.name).toBe("test laptop");
    expect(row.key_hash).toBe(hashKey(key));
    expect(row.key_prefix).toBe(key.slice(0, 17));
    expect(row.scopes).toEqual(["read"]);
    const everything = JSON.stringify(
      await sql`select * from app.mcp_api_keys where id = ${id}`,
    );
    expect(everything).not.toContain(key);
  });

  it("authenticates by hash, stamps last use, and stops the moment it is revoked", async () => {
    const { id, key } = await createMcpKey("revocable", null);
    expect(await authenticateMcpKey(`${key.slice(0, -1)}x`)).toBeNull();

    const identity = await authenticateMcpKey(key);
    expect(identity).toEqual({ id, scopes: ["read"] });
    const listed = (await listMcpKeys()).find((k) => k.id === id);
    expect(listed?.lastUsedAt).toBeInstanceOf(Date);

    expect(await revokeMcpKey(id)).toBe(true);
    expect(await revokeMcpKey(id)).toBe(false);
    expect(await authenticateMcpKey(key)).toBeNull();
  });

  it("refuses write scopes and malformed hashes at the database", async () => {
    await expect(sql`
      insert into app.mcp_api_keys (name, key_prefix, key_hash, scopes)
      values ('w', 'gvos_mcp_x', ${"a".repeat(64)}, '{read,write}')`).rejects.toThrow(
      /scopes_check/,
    );
    await expect(sql`
      insert into app.mcp_api_keys (name, key_prefix, key_hash)
      values ('w', 'gvos_mcp_x', 'plain-text-key')`).rejects.toThrow(/hash_check/);
    await expect(sql`
      insert into app.mcp_api_keys (name, key_prefix, key_hash)
      values ('   ', 'gvos_mcp_x', ${"b".repeat(64)})`).rejects.toThrow(/name_check/);
  });
});
