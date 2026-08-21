import {
  bigint,
  bigserial,
  char,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { clients, deals, profiles, reps } from "@/db/schema/app";

/**
 * The `ledger` schema holds append-only money events.
 *
 * Rules, enforced by the database rather than by convention:
 *
 *   1. Amounts are `bigint` CENTS, signed. Positive is money in, negative is
 *      money out. Never a float, never dollars.
 *   2. Rows are INSERT-only. A trigger rejects UPDATE and DELETE outright.
 *   3. Mistakes are corrected with a REVERSING row (`reversesId`), never an
 *      edit. History is evidence, not a working copy.
 *   4. Balances are derived in views. No stored balance can drift.
 *   5. Every row carries an `idempotencyKey`. A retried webhook, a
 *      double-clicked form, or a re-run import cannot double-count.
 */
export const ledgerSchema = pgSchema("ledger");

export const moneyEvents = ledgerSchema.table(
  "money_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Total order, for audit and for "everything up to here". */
    seq: bigserial("seq", { mode: "number" }).notNull(),

    /** When it happened in the world. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** When we learned about it. Differs from occurredAt on imports and backfills. */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),

    /**
     * payment_received · refund · processor_fee · payout · adjustment
     * Kept as text rather than an enum: adding a type must not require a
     * migration that locks the table.
     */
    eventType: text("event_type").notNull(),

    /** Signed, in cents. */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("USD"),

    clientId: uuid("client_id").references(() => clients.id),
    dealId: uuid("deal_id").references(() => deals.id),
    /** The rep a payout event pays. Null for deal-level events (payments, fees). */
    repId: uuid("rep_id").references(() => reps.id),

    /** fanbasis · wire · ach · zelle · stripe … */
    processor: text("processor"),

    /** Who recorded it. Null for automated imports. */
    actorId: uuid("actor_id").references(() => profiles.id),
    /** ui · import · webhook:fanbasis */
    source: text("source").notNull(),

    /** The double-counting guard. Unique, always present. */
    idempotencyKey: text("idempotency_key").notNull(),

    /** Set when this row reverses an earlier one. */
    reversesId: uuid("reverses_id"),

    /** Which import batch created it, so a bad run can be reversed wholesale. */
    importBatchId: uuid("import_batch_id"),

    memo: text("memo"),
    /** The original source row, kept verbatim for audit. */
    payload: jsonb("payload").notNull().default({}),
  },
  (table) => [
    uniqueIndex("money_events_idempotency_key").on(table.idempotencyKey),
    index("money_events_occurred_at_idx").on(table.occurredAt),
    index("money_events_client_idx").on(table.clientId),
    index("money_events_deal_idx").on(table.dealId),
    index("money_events_rep_idx").on(table.repId),
    index("money_events_batch_idx").on(table.importBatchId),
  ],
);

export type MoneyEvent = typeof moneyEvents.$inferSelect;
export type NewMoneyEvent = typeof moneyEvents.$inferInsert;
