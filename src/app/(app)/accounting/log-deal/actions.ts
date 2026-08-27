"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { appendFinanceSheetRow } from "@/lib/google/sheets";
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
export async function logAgencyDeal(raw: z.input<typeof input>) {
  await requireAgencyUser();
  const i = input.parse(raw);

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
  return { ok: true, range };
}
