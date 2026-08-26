/**
 * GV OS staging seed runner.
 *
 * Populates staging with deterministic FAKE data so every screen — Dashboard,
 * Sales, Leaderboard, Quotas, Call Log, Gamification — comes alive for
 * development and demos. It writes ONLY to staging (guarded), touches ONLY its
 * own rows (every one tagged with the `demo-seed` marker), and never goes near
 * the real production database.
 *
 * It DOES seed demo `ledger.money_events` (payment_received rows tied to demo
 * deals) — that is what lights up rep Cash on the Leaderboard and the "best
 * cash day" record. The ledger stays append-only for everything real: seeded
 * rows are marker-tagged and idempotent, and reset removes only those, using
 * the same one-shot trigger-disable the transactions backlog already relies on.
 *
 * Usage (via package.json):
 *   npm run seed            reset demo-seed rows, then reseed  (idempotent)
 *   npm run seed -- --no-reset   insert without clearing first
 *   npm run db:reset        remove every demo-seed row, seed nothing
 *
 * The prod guard runs first, before any connection is opened. If the resolved
 * connection string is not provably the staging project, the script aborts and
 * writes nothing.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "@/db/schema/app";
import {
  actionItems,
  activityLogs,
  activityReports,
  clients,
  deals,
  eodTemplates,
  integrations,
  kitSnapshots,
  notifications,
  offerSettings,
  profiles,
  quotas,
  reps,
  revShareRules,
  teamMembers,
  transactions,
} from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";

import {
  ProdGuardError,
  readSecrets,
  resolveStagingUrl,
  STAGING_PROJECT_REF,
} from "./guard";
import { buildSeedData, DEMO_EMAIL_DOMAIN, MARKER, SEED } from "./fixtures";
import { Rng } from "./rng";

const LIKE_MARKER = `${MARKER}:%`;
const EMAIL_LIKE = `%@${DEMO_EMAIL_DOMAIN}`;
const CHUNK = 200;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Sql = ReturnType<typeof postgres>;

/** Delete the append-only transactions rows we own, bypassing the guard trigger. */
async function resetTransactions(pg: Sql): Promise<void> {
  const pattern = LIKE_MARKER;
  try {
    await pg.begin(async (tx) => {
      await tx.unsafe(
        "ALTER TABLE app.transactions DISABLE TRIGGER transactions_no_delete",
      );
      await tx`DELETE FROM app.transactions WHERE idempotency_key LIKE ${pattern}`;
      await tx.unsafe(
        "ALTER TABLE app.transactions ENABLE TRIGGER transactions_no_delete",
      );
    });
  } catch {
    // Fallback: disable all triggers for this session only, then delete.
    // session_replication_role is session-scoped and never alters the schema.
    await pg.begin(async (tx) => {
      await tx.unsafe("SET LOCAL session_replication_role = replica");
      await tx`DELETE FROM app.transactions WHERE idempotency_key LIKE ${pattern}`;
    });
  }
}

/**
 * Delete the append-only ledger money_events we own, bypassing the immutability
 * trigger. Mirrors resetTransactions: the ledger rejects DELETE by design, so we
 * disable our own guard trigger for a single transaction (or, as a fallback,
 * session_replication_role — session-scoped, never a schema change) and remove
 * only the marker-tagged demo rows. Runs before deals/clients/reps are deleted,
 * since money_events references them.
 */
async function resetMoneyEvents(pg: Sql): Promise<void> {
  const pattern = LIKE_MARKER;
  try {
    await pg.begin(async (tx) => {
      await tx.unsafe(
        "ALTER TABLE ledger.money_events DISABLE TRIGGER money_events_no_delete",
      );
      await tx`DELETE FROM ledger.money_events WHERE idempotency_key LIKE ${pattern}`;
      await tx.unsafe(
        "ALTER TABLE ledger.money_events ENABLE TRIGGER money_events_no_delete",
      );
    });
  } catch {
    await pg.begin(async (tx) => {
      await tx.unsafe("SET LOCAL session_replication_role = replica");
      await tx`DELETE FROM ledger.money_events WHERE idempotency_key LIKE ${pattern}`;
    });
  }
}

/** Remove every demo-seed row, children before parents, so no FK ever trips. */
async function reset(db: Db, pg: Sql): Promise<void> {
  await resetTransactions(pg);
  await resetMoneyEvents(pg);
  // Demo clients' ids — kit snapshots + integrations are scoped by client, not
  // a text marker, so they are cleared the same way offer_settings is.
  const demoClientIds = db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.externalRef, MARKER));
  await db.delete(kitSnapshots).where(inArray(kitSnapshots.clientId, demoClientIds));
  await db.delete(integrations).where(inArray(integrations.clientId, demoClientIds));
  await db.delete(actionItems).where(like(actionItems.notes, `${MARKER}%`));
  await db.delete(revShareRules).where(like(revShareRules.note, `${MARKER}%`));
  await db.delete(notifications).where(like(notifications.dedupeKey, LIKE_MARKER));
  await db.delete(activityLogs).where(like(activityLogs.externalRef, LIKE_MARKER));
  await db
    .delete(activityReports)
    .where(like(activityReports.externalRef, LIKE_MARKER));
  await db.delete(quotas).where(like(quotas.notes, `${MARKER}%`));
  await db
    .delete(offerSettings)
    .where(
      inArray(
        offerSettings.clientId,
        db
          .select({ id: clients.id })
          .from(clients)
          .where(eq(clients.externalRef, MARKER)),
      ),
    );
  await db.delete(eodTemplates).where(like(eodTemplates.externalRef, LIKE_MARKER));
  await db.delete(deals).where(like(deals.externalRef, LIKE_MARKER));
  await db.delete(teamMembers).where(like(teamMembers.email, EMAIL_LIKE));
  await db.delete(reps).where(like(reps.externalRef, LIKE_MARKER));
  await db.delete(clients).where(eq(clients.externalRef, MARKER));
  await db.delete(profiles).where(like(profiles.email, EMAIL_LIKE));
}

/** Insert rows in chunks with onConflictDoNothing, so a re-run never collides. */
async function insertAll<T extends { $inferInsert: object }>(
  db: Db,
  table: T,
  rows: object[],
): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.insert(table as any) as any).values(chunk).onConflictDoNothing();
    inserted += chunk.length;
  }
  return inserted;
}

/** Live counts of seed-owned rows, for the run report. */
async function countSeed(pg: Sql): Promise<Record<string, number>> {
  const one = async (q: Promise<{ count: number }[]>) => Number((await q)[0].count);
  return {
    profiles: await one(
      pg`select count(*)::int as count from app.profiles where email like ${EMAIL_LIKE}`,
    ),
    clients: await one(
      pg`select count(*)::int as count from app.clients where external_ref = ${MARKER}`,
    ),
    reps: await one(
      pg`select count(*)::int as count from app.reps where external_ref like ${LIKE_MARKER}`,
    ),
    team_members: await one(
      pg`select count(*)::int as count from app.team_members where email like ${EMAIL_LIKE}`,
    ),
    deals: await one(
      pg`select count(*)::int as count from app.deals where external_ref like ${LIKE_MARKER}`,
    ),
    activity_reports: await one(
      pg`select count(*)::int as count from app.activity_reports where external_ref like ${LIKE_MARKER}`,
    ),
    eod_templates: await one(
      pg`select count(*)::int as count from app.eod_templates where external_ref like ${LIKE_MARKER}`,
    ),
    quotas: await one(
      pg`select count(*)::int as count from app.quotas where notes like ${MARKER + "%"}`,
    ),
    activity_logs: await one(
      pg`select count(*)::int as count from app.activity_logs where external_ref like ${LIKE_MARKER}`,
    ),
    notifications: await one(
      pg`select count(*)::int as count from app.notifications where dedupe_key like ${LIKE_MARKER}`,
    ),
    offer_settings: await one(
      pg`select count(*)::int as count from app.offer_settings where client_id in (select id from app.clients where external_ref = ${MARKER})`,
    ),
    transactions: await one(
      pg`select count(*)::int as count from app.transactions where idempotency_key like ${LIKE_MARKER}`,
    ),
    money_events: await one(
      pg`select count(*)::int as count from ledger.money_events where idempotency_key like ${LIKE_MARKER}`,
    ),
    rev_share_rules: await one(
      pg`select count(*)::int as count from app.rev_share_rules where note like ${MARKER + "%"}`,
    ),
    integrations: await one(
      pg`select count(*)::int as count from app.integrations where client_id in (select id from app.clients where external_ref = ${MARKER})`,
    ),
    kit_snapshots: await one(
      pg`select count(*)::int as count from app.kit_snapshots where client_id in (select id from app.clients where external_ref = ${MARKER})`,
    ),
    action_items: await one(
      pg`select count(*)::int as count from app.action_items where notes like ${MARKER + "%"}`,
    ),
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const resetOnly = args.has("--reset-only");
  const skipReset = args.has("--no-reset");

  // ---- PROD GUARD: the very first thing, before any connection is opened. ----
  const url = resolveStagingUrl(readSecrets());
  console.log(`✓ Prod guard passed — target is staging (${STAGING_PROJECT_REF}).`);

  const pg = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
  const db = drizzle(pg, { schema });

  try {
    if (!skipReset || resetOnly) {
      console.log("→ Clearing existing demo-seed rows…");
      await reset(db, pg);
      console.log("  demo-seed rows cleared.");
    }

    if (resetOnly) {
      const counts = await countSeed(pg);
      const remaining = Object.values(counts).reduce((s, n) => s + n, 0);
      console.log(`✓ Reset complete. ${remaining} demo-seed rows remain (expected 0).`);
      return;
    }

    console.log(`→ Building deterministic data (seed=0x${SEED.toString(16)})…`);
    const data = buildSeedData(new Rng(SEED));

    console.log("→ Inserting…");
    // Parents before children so every FK resolves.
    await insertAll(db, profiles, data.profiles);
    await insertAll(db, clients, data.clients);
    await insertAll(db, reps, data.reps);
    await insertAll(db, teamMembers, data.teamMembers);
    await insertAll(db, deals, data.deals);
    await insertAll(db, moneyEvents, data.moneyEvents);
    await insertAll(db, revShareRules, data.revShareRules);
    await insertAll(db, integrations, data.integrations);
    await insertAll(db, kitSnapshots, data.kitSnapshots);
    await insertAll(db, activityReports, data.activityReports);
    await insertAll(db, eodTemplates, data.eodTemplates);
    await insertAll(db, quotas, data.quotas);
    await insertAll(db, activityLogs, data.activityLogs);
    await insertAll(db, notifications, data.notifications);
    await insertAll(db, offerSettings, data.offerSettings);
    await insertAll(db, actionItems, data.actionItems);
    await insertAll(db, transactions, data.transactions);

    const counts = await countSeed(pg);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    console.log("\n✓ Seed complete. Rows in staging (demo-seed only):");
    for (const [table, n] of Object.entries(counts)) {
      console.log(`   ${String(n).padStart(5)}  app.${table}`);
    }
    console.log(`   ${String(total).padStart(5)}  TOTAL`);
    console.log(
      "\n   ledger.money_events seeded (demo payment_received only, marker-tagged);" +
        " append-only guard intact for every real row.",
    );
  } finally {
    await pg.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  if (error instanceof ProdGuardError) {
    console.error(`\n✗ ${error.message}\n`);
  } else {
    console.error("\n✗ Seed failed:", error);
  }
  process.exit(1);
});
