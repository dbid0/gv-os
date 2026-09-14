/**
 * @vitest-environment node
 *
 * latestSnapshotsBySource must return the newest snapshot PER SOURCE no matter
 * how many rows a single source has written — proved against a real Postgres.
 *
 * The offer money headline wins from the Stripe tracking snapshot. The old
 * query read the 50 most-recent rows and then deduped by source in JS: if
 * pruning ever failed and a high-frequency source (a hand-logged sheet) filled
 * that 50-row window, the once-a-day Stripe snapshot fell outside it and the
 * money feed silently dropped back to the sheet/empty. This is exactly the kind
 * of volume-dependent failure a pure-function test cannot catch — the guarantee
 * lives in the SQL (DISTINCT ON over the (client_id, source, created_at) index)
 * — so it is asserted here against a database with >50 rows.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { clients, clientTrackingSyncs } from "@/db/schema/app";
import { latestSnapshotsBySource } from "@/lib/tracking/queries";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)(
  "latestSnapshotsBySource is correct past a 50-row window",
  () => {
    let clientId: string;
    const base = Date.parse("2026-01-01T00:00:00Z");
    // A distinct rowCount marker for the newest sheet row and the lone stripe
    // row, so the assertions can prove WHICH row was chosen, not just its source.
    const NEWEST_SHEET_ROWCOUNT = 59;
    const STRIPE_ROWCOUNT = 777;

    beforeAll(async () => {
      await runMigrations(databaseUrl);
      const db = getDb();
      const slug = `snap-latest-${Date.now()}`;
      const [client] = await db
        .insert(clients)
        .values({ name: "Snap Latest", slug })
        .returning({ id: clients.id });
      clientId = client.id;

      // 60 sheet snapshots (a heavy, high-frequency source), newest last, plus
      // ONE stripe snapshot placed as the OLDEST row of all — well outside any
      // 50-most-recent window.
      const rows = Array.from({ length: 60 }, (_, i) => ({
        clientId,
        source: "sheet",
        spreadsheetId: "sheet-abc",
        rowCount: i,
        createdAt: new Date(base + (i + 10) * 60_000),
      }));
      rows.push({
        clientId,
        source: "stripe",
        spreadsheetId: "integrations:stripe",
        rowCount: STRIPE_ROWCOUNT,
        createdAt: new Date(base), // the single oldest row overall
      });
      await db.insert(clientTrackingSyncs).values(rows);
    });

    afterAll(async () => {
      // Cascades to the snapshot rows via the client_id FK; explicit for clarity.
      const db = getDb();
      await db
        .delete(clientTrackingSyncs)
        .where(eq(clientTrackingSyncs.clientId, clientId));
      await db.delete(clients).where(eq(clients.id, clientId));
      await closeDb();
    });

    it("returns the newest snapshot for EACH source — stripe survives past 50 rows", async () => {
      const out = await latestSnapshotsBySource(clientId);
      const bySource = new Map(out.map((o) => [o.source, o.snapshot]));

      // Exactly one entry per source, both sources present.
      expect(out.length).toBe(2);
      expect(bySource.has("sheet")).toBe(true);
      expect(bySource.has("stripe")).toBe(true);

      // The low-frequency stripe snapshot is NOT lost to 60 newer sheet rows —
      // the money headline can never silently fall back for row-volume reasons.
      expect(bySource.get("stripe")?.rowCount).toBe(STRIPE_ROWCOUNT);

      // The sheet resolves to its NEWEST row (highest createdAt == rowCount 59).
      expect(bySource.get("sheet")?.rowCount).toBe(NEWEST_SHEET_ROWCOUNT);
    });
  },
);
