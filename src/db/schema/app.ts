import { pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The `app` schema holds mutable operational state: people, clients, deals,
 * calls, tasks. Normal CRUD lives here.
 *
 * Money does NOT live here. See src/db/schema/ledger.ts.
 */
export const appSchema = pgSchema("app");

/**
 * One row per human who can use GV OS.
 *
 * `id` mirrors the Supabase Auth user id (auth.users.id) so there is exactly
 * one identity per person across auth and application data.
 */
export const profiles = appSchema.table("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
