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
      max: 1,
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
