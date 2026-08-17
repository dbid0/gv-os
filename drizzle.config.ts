import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated into ./drizzle as plain SQL, committed, and reviewed
 * like any other code. We never run `drizzle-kit push` against a real database:
 * pushing diffs the schema live, which is exactly how a column silently
 * disappears in production.
 */
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
