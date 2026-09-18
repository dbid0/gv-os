/**
 * @vitest-environment node
 *
 * Seat rates against a real Postgres. These rules decide what a rep is paid,
 * so what matters is that a save lands WHOLE: every seat the operator typed,
 * or none of them. The old implementation ran a delete and an insert per seat
 * untransacted, where a failure halfway left seats cleared and never
 * rewritten — and a cleared seat derives NULL commission, so a rep quietly
 * stops being paid while the screen still shows the rates that were typed.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { listRates, saveClientRates } from "@/lib/payments/rates-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("client seat rates", () => {
  let sql: postgres.Sql;
  let clientId: string;
  let otherClientId: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    [{ id: clientId }] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('Rates A', ${"rates-a-" + tag}) returning id`;
    [{ id: otherClientId }] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('Rates B', ${"rates-b-" + tag}) returning id`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  const mine = async () =>
    (await listRates())
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => a.salesRole.localeCompare(b.salesRole));

  it("writes every seat that was given a rate", async () => {
    await saveClientRates(clientId, { setter: 500, closer: 1000, dm_setter: 250 });
    expect(await mine()).toEqual([
      { clientId, salesRole: "closer", rateBps: 1000, priority: 100 },
      { clientId, salesRole: "dm_setter", rateBps: 250, priority: 100 },
      { clientId, salesRole: "setter", rateBps: 500, priority: 100 },
    ]);
  });

  it("replaces rather than accumulates when saved again", async () => {
    await saveClientRates(clientId, { setter: 500, closer: 1000, dm_setter: 250 });
    await saveClientRates(clientId, { setter: 600, closer: 1200, dm_setter: 300 });
    expect((await mine()).map((r) => r.rateBps)).toEqual([1200, 300, 600]);
  });

  it("clears one seat without touching the others", async () => {
    // Null is "unknown", which derives a null commission — not zero, and not
    // a reason for the other two seats to move.
    await saveClientRates(clientId, { setter: 500, closer: 1000, dm_setter: 250 });
    await saveClientRates(clientId, { setter: 500, closer: null, dm_setter: 250 });
    expect(await mine()).toEqual([
      { clientId, salesRole: "dm_setter", rateBps: 250, priority: 100 },
      { clientId, salesRole: "setter", rateBps: 500, priority: 100 },
    ]);
  });

  it("accepts an all-null save — every seat goes back to unknown", async () => {
    await saveClientRates(clientId, { setter: 500, closer: 1000, dm_setter: 250 });
    await saveClientRates(clientId, { setter: null, closer: null, dm_setter: null });
    expect(await mine()).toEqual([]);
  });

  it("stores a zero rate as a real zero, not as unknown", async () => {
    // 0 bps is a deliberate "this seat earns nothing on this offer", which is
    // a different statement from "nobody has said".
    await saveClientRates(clientId, { setter: 0, closer: null, dm_setter: null });
    expect(await mine()).toEqual([
      { clientId, salesRole: "setter", rateBps: 0, priority: 100 },
    ]);
  });

  it("never touches another client's rates", async () => {
    await saveClientRates(otherClientId, { setter: 900, closer: 900, dm_setter: 900 });
    await saveClientRates(clientId, { setter: null, closer: null, dm_setter: null });
    const theirs = (await listRates()).filter((r) => r.clientId === otherClientId);
    expect(theirs).toHaveLength(3);
  });

  it("leaves the previous rates standing when a save cannot complete", async () => {
    // The point of the transaction: a save that blows up must not leave the
    // client half-rated. An out-of-range bps is rejected by the column, which
    // is a real failure arriving mid-statement.
    await saveClientRates(clientId, { setter: 500, closer: 1000, dm_setter: 250 });
    await expect(
      saveClientRates(clientId, {
        setter: 700,
        closer: Number.MAX_SAFE_INTEGER,
        dm_setter: 400,
      }),
    ).rejects.toThrow();
    // All three original rates survive — not one of them was cleared.
    expect((await mine()).map((r) => r.rateBps)).toEqual([1000, 250, 500]);
  });
});
