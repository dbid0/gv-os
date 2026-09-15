/**
 * @vitest-environment node
 *
 * Speed to lead reads the offer's Close connection. A client can hold more
 * than one Close row (a revoked one left beside the live one); the connected
 * row must decide, not whichever row Postgres happens to return first.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { offerSpeedToLead } from "@/lib/crm/offer-stl";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("offer speed to lead — Close connection", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  async function makeClient(label: string) {
    const slug = `stl-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values (${"STL " + label}, ${slug}) returning id`;
    return client.id;
  }

  it("treats the offer as connected when a revoked Close row sits beside the live one", async () => {
    const clientId = await makeClient("both");
    // The revoked row goes in FIRST, so an unordered read would find it first.
    await sql`
      insert into app.integrations (provider, label, client_id, status)
      values ('close', 'old close', ${clientId}, 'revoked')`;
    await sql`
      insert into app.integrations (provider, label, client_id, status)
      values ('close', 'live close', ${clientId}, 'connected')`;

    const stl = await offerSpeedToLead(clientId);
    expect(stl.connected).toBe(true);
  });

  it("stays disconnected when the only Close row is revoked", async () => {
    const clientId = await makeClient("revoked");
    await sql`
      insert into app.integrations (provider, label, client_id, status)
      values ('close', 'old close', ${clientId}, 'revoked')`;

    const stl = await offerSpeedToLead(clientId);
    expect(stl.connected).toBe(false);
  });
});
