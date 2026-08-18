import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The `app` schema holds mutable operational state: people, clients, deals.
 * Normal CRUD lives here.
 *
 * Money does NOT live here. A deal records what was AGREED; the cash against it
 * lives as immutable events in the `ledger` schema. That separation is what
 * makes payment plans, partial collections, and accounts receivable fall out
 * naturally, instead of needing a "balance" column that can drift out of step
 * with what actually happened.
 */
export const appSchema = pgSchema("app");

/** One row per human who can use GV OS. `id` mirrors the Supabase Auth user id. */
export const profiles = appSchema.table("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A client brand: The Grid, The Vault, Racks Closes. */
export const clients = appSchema.table(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** URL-safe key, stable across renames. */
    slug: text("slug").notNull(),
    /** active | archived. Archived clients never count in a roster or a report. */
    status: text("status").notNull().default("active"),
    /** Where a row came from, so imported records are always identifiable. */
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("clients_slug_key").on(table.slug)],
);

/**
 * An agreement. NOT a money event.
 *
 * `contractValueCents` is what was agreed, which is a fact about the deal.
 * What has actually been collected is derived from the ledger, never stored
 * here, so the two can never disagree.
 */
export const deals = appSchema.table(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),

    /** Setup · DFY Build · Rev-Share · Client Handoff · Other, and the newer ones. */
    dealType: text("deal_type").notNull(),
    offer: text("offer"),

    /** Total contract value in CENTS. Never a float, never dollars. */
    contractValueCents: bigint("contract_value_cents", { mode: "number" })
      .notNull()
      .default(0),

    closedAt: timestamp("closed_at", { withTimezone: true }),
    agreementSigned: text("agreement_signed"),
    notes: text("notes"),

    /**
     * Stable key for the source row this came from. Makes import idempotent:
     * re-running the importer updates rather than duplicating.
     */
    externalRef: text("external_ref"),
    /** Which import batch created it, so one bad run can be reversed wholesale. */
    importBatchId: uuid("import_batch_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("deals_external_ref_key").on(table.externalRef),
    index("deals_client_idx").on(table.clientId),
    index("deals_closed_at_idx").on(table.closedAt),
  ],
);

/**
 * Partner split rules, effective-dated.
 *
 * Splits are CONFIGURATION, not constants in code. The standing 50/50 and the
 * historical 45/55 and 30/70 overrides are all just rows, so a rule change is
 * data and history stays correct rather than being retroactively rewritten.
 *
 * Basis points: 5000 = 50%.
 */
export const partnerSplits = appSchema.table(
  "partner_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null = the default rule. Set = an override for one client. */
    clientId: uuid("client_id").references(() => clients.id),
    /** Null = applies to every deal type. Set = only that type. */
    dealType: text("deal_type"),
    danielBps: bigint("daniel_bps", { mode: "number" }).notNull(),
    gusBps: bigint("gus_bps", { mode: "number" }).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("partner_splits_client_idx").on(table.clientId)],
);

export const clientsRelations = relations(clients, ({ many }) => ({
  deals: many(deals),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  client: one(clients, { fields: [deals.clientId], references: [clients.id] }),
}));

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type PartnerSplit = typeof partnerSplits.$inferSelect;
