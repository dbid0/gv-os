/**
 * @vitest-environment node
 *
 * Runs against a real Postgres. CI provides one as a service container; locally
 * it uses DATABASE_URL if you have a database pointed at it.
 *
 * These tests assert the things a unit test cannot: that the generated SQL
 * actually applies, that the schema boundary exists, and that constraints
 * really constrain.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@/db/migrate";

const databaseUrl = process.env.DATABASE_URL;

// A skipped test that looks green is worse than a failing one. If CI has no
// database, that is a broken pipeline, not a reason to pass quietly.
if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("migrations", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("creates both the app and ledger schemas", async () => {
    const rows = await sql<{ schema_name: string }[]>`
      select schema_name from information_schema.schemata
      where schema_name in ('app', 'ledger')
      order by schema_name
    `;

    expect(rows.map((row) => row.schema_name)).toEqual(["app", "ledger"]);
  });

  it("creates app.profiles with the expected columns", async () => {
    const rows = await sql<{ column_name: string; data_type: string }[]>`
      select column_name, data_type from information_schema.columns
      where table_schema = 'app' and table_name = 'profiles'
      order by column_name
    `;

    expect(rows.map((row) => row.column_name)).toEqual([
      "created_at",
      "email",
      "full_name",
      "id",
      "updated_at",
    ]);
  });

  it("enforces the unique constraint on email", async () => {
    const id1 = "11111111-1111-4111-8111-111111111111";
    const id2 = "22222222-2222-4222-8222-222222222222";
    const email = `dup-${Date.now()}@example.com`;

    await sql`insert into app.profiles (id, email) values (${id1}, ${email})`;

    await expect(
      sql`insert into app.profiles (id, email) values (${id2}, ${email})`,
    ).rejects.toThrow();

    await sql`delete from app.profiles where id = ${id1}`;
  });

  it("is idempotent: running migrations twice is a no-op", async () => {
    await expect(runMigrations(databaseUrl)).resolves.not.toThrow();
  });
});
