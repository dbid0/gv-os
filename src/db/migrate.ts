import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { parseServerEnv } from "@/env.schema";

/**
 * Applies every pending migration in ./drizzle, in order.
 *
 * Run explicitly (`npm run db:migrate`), never automatically on boot: a
 * serverless function cold-starting is not a safe place to alter a schema.
 *
 * Uses a direct (non-pooled) connection with max: 1, because DDL through a
 * transaction pooler is unreliable.
 */
export async function runMigrations(databaseUrl?: string) {
  const env = databaseUrl ? undefined : parseServerEnv(process.env);
  // Session pooler when we have one, otherwise whatever DATABASE_URL points at.
  const url = databaseUrl ?? env!.MIGRATION_DATABASE_URL ?? env!.DATABASE_URL;

  const client = postgres(url, { max: 1, prepare: false });

  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Executed directly via `npm run db:migrate`.
if (process.argv[1]?.includes("migrate")) {
  runMigrations()
    .then(() => {
      console.log("migrations applied");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error("migration failed:", error);
      process.exit(1);
    });
}
