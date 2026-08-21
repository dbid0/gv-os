"use server";

import { revalidatePath } from "next/cache";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { runFinanceSheetSync, type SyncSummary } from "@/lib/accounting/sheet-sync";

async function requireUser() {
  // Build phase: auth is off (see middleware DISABLE_AUTH).
  if (process.env.DISABLE_AUTH === "true") return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

export async function syncFinanceSheet(): Promise<SyncSummary> {
  await requireUser();
  const summary = await runFinanceSheetSync();
  revalidatePath("/accounting/reconciliation");
  return summary;
}
