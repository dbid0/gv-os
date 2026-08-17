import { pgSchema } from "drizzle-orm/pg-core";

/**
 * The `ledger` schema holds append-only money events. It is deliberately EMPTY
 * in the foundation phase, and exists now so the boundary is physical from day
 * one rather than bolted on later.
 *
 * When tables land here (Phase 3, Accounting), they obey these rules:
 *
 *   1. Amounts are `bigint` CENTS, signed. Never a float, never dollars.
 *   2. Rows are INSERT-only. A trigger rejects UPDATE and DELETE, and the
 *      application's Postgres role is not granted those privileges.
 *   3. Mistakes are corrected with a reversing row (`reverses_id`), never an
 *      edit. History is evidence, not a working copy.
 *   4. Balances are derived in views. No stored balance column can drift.
 *
 * See docs/RELIABILITY.md and the ledger DDL in the build plan.
 */
export const ledgerSchema = pgSchema("ledger");
