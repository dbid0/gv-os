import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { settings } from "@/db/schema/app";

/**
 * Org-level settings, read with defaults.
 *
 * Goals are TARGETS, not ledger money — kept here, never in the money tables.
 * The store is one JSON row, so a new preference never needs a migration.
 */
export interface OrgSettings {
  monthlyRevenueGoalCents: number;
  showRateGoalPct: number | null;
  closeRateGoalPct: number | null;
  currency: string;
}

export const DEFAULT_SETTINGS: OrgSettings = {
  monthlyRevenueGoalCents: 0,
  showRateGoalPct: null,
  closeRateGoalPct: null,
  currency: "USD",
};

export async function getSettings(): Promise<OrgSettings> {
  const db = getDb();
  const [row] = await db.select().from(settings).where(eq(settings.id, "org")).limit(1);
  const data = (row?.data ?? {}) as Partial<OrgSettings>;
  return { ...DEFAULT_SETTINGS, ...data };
}
