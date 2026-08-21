import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { serverEnv } from "@/env.server";

/**
 * Database client.
 *
 * Async from the very first commit, deliberately. The ggv-portal codebase was
 * written against a synchronous SQLite driver, and that single choice is what
 * blocked it from ever moving to hosted Postgres. Every call here returns a
 * Promise and every caller awaits it.
 *
 * Connection handling is tuned for serverless: each Vercel function instance
 * keeps a tiny pool, and `prepare: false` is required when talking through a
 * transaction pooler (Supabase port 6543), which does not support prepared
 * statements.
 */

let client: postgres.Sql | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!database) {
    client = postgres(serverEnv().DATABASE_URL, {
      // THE POOL LAW — learned twice, never again: when queries in flight
      // exceed `max`, postgres-js pipelines the excess onto busy connections,
      // and Supabase's transaction pooler (port 6543) never answers pipelined
      // simple queries. The page doesn't slow down — it hangs FOREVER.
      // Round 2 (2026-08-20): max:1 + 5 parallel = infinite hang. Round 4
      // (2026-08-21): 14 parallel on max:10 hung the dashboard at 90s+.
      // So: max stays comfortably above any page's worst-case burst (keep
      // bursts ≤ ~8 per request; see getMorningGlance), and 24 client
      // connections are cheap — the pooler multiplexes real backends itself.
      max: 24,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    database = drizzle(client, { schema });
  }

  return database;
}

/** Closes the pool. Tests and scripts use this; request handlers never do. */
export async function closeDb() {
  await client?.end({ timeout: 5 });
  client = undefined;
  database = undefined;
}
