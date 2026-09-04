"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import {
  appendFinanceSheetRow,
  FINANCE_SHEET_ID,
  readSheetValues,
} from "@/lib/google/sheets";
import { findDuplicateDeal } from "@/lib/accounting/deal-dedupe";
import { financeRawRow } from "@/lib/accounting/sheet-write";
import { runFinanceSheetSync } from "@/lib/accounting/sheet-sync";

async function requireAgencyUser() {
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const dollarsToCents = (n: number) => Math.round(n * 100);

const input = z.object({
  dateClosed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date."),
  client: z.string().min(1, "Client is required."),
  dealType: z.string().min(1, "Deal type is required."),
  offer: z.string().default(""),
  revenueDollars: z.number().min(0),
  cashDollars: z.number().min(0),
  method: z.string().min(1, "Payment method is required."),
  pctEntered: z.number().nullable().default(null),
  feeOverrideDollars: z.number().nullable().default(null),
  agreement: z.string().default(""),
  notes: z.string().default(""),
  payoutStatus: z.string().default(""),
});

/**
 * Log an AGENCY deal — appends a row to the finance sheet's Raw Data tab (the
 * same place the Google new-sale form writes), then re-syncs so it shows up in
 * GV OS immediately. This is the admin/agency counterpart to a rep logging their
 * own deal; the sheet stays the system of record and the mirror reads it back.
 * Column order is locked to the reader by the sheet-write round-trip test.
 */
export async function logAgencyDeal(
  raw: z.input<typeof input>,
  /**
   * Log it even though an identical deal is already on the sheet.
   *
   * A client genuinely can pay the same amount twice on the same day, so the
   * duplicate check refuses and explains rather than blocking outright — this
   * is the deliberate "yes, log it anyway" that follows.
   */
  allowDuplicate = false,
) {
  await requireAgencyUser();
  const i = input.parse(raw);

  // The finance sheet is the system of record: a deal logged twice inflates
  // GV's revenue, its rev-share owed and both partners' distributions, and it
  // is invisible unless someone scrolls the sheet. The form's disabled button
  // stops a double-click; it does nothing about the case that actually
  // happens — a request that succeeded but looked like it failed, logged again.
  if (!allowDuplicate) {
    try {
      const existing = await readSheetValues(FINANCE_SHEET_ID, "Raw Data!A2:M200");
      const at = findDuplicateDeal(existing, {
        dateClosed: i.dateClosed,
        client: i.client.trim(),
        dealType: i.dealType.trim(),
        revenueCents: dollarsToCents(i.revenueDollars),
        cashCents: dollarsToCents(i.cashDollars),
      });
      if (at !== null) {
        return {
          ok: false as const,
          duplicate: true as const,
          sheetRow: at,
          message: `Row ${at} of Raw Data already has this exact deal — same client, date, type and amounts. Log it again only if this really is a second payment.`,
        };
      }
    } catch {
      // Never block a real deal because the check could not run. The sheet is
      // still appended; a duplicate is recoverable, a lost deal is not.
    }
  }

  // CT timestamp for column A, matching how the sheet's own rows are stamped.
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
  });

  const row = financeRawRow(
    {
      dateClosed: i.dateClosed,
      client: i.client.trim(),
      dealType: i.dealType.trim(),
      offer: i.offer.trim(),
      revenueCents: dollarsToCents(i.revenueDollars),
      cashCents: dollarsToCents(i.cashDollars),
      method: i.method.trim(),
      pctEntered: i.pctEntered,
      feeOverrideCents:
        i.feeOverrideDollars == null ? null : dollarsToCents(i.feeOverrideDollars),
      agreement: i.agreement.trim(),
      notes: i.notes.trim(),
      payoutStatus: i.payoutStatus.trim(),
    },
    timestamp,
  );

  const range = await appendFinanceSheetRow(row);

  // Pull the sheet back into GV OS so the deal appears here right away. Never
  // fatal — the row is already safely in the sheet (the system of record).
  try {
    await runFinanceSheetSync();
  } catch {
    /* the mirror's own cron will catch it up shortly */
  }

  revalidatePath("/accounting");
  return { ok: true as const, duplicate: false as const, range };
}
