"use server";

import { revalidatePath } from "next/cache";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { runFinanceSheetSync, type SyncSummary } from "@/lib/accounting/sheet-sync";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

export async function syncFinanceSheet(): Promise<SyncSummary> {
  await requireUser();
  const summary = await runFinanceSheetSync();
  revalidatePath("/accounting/reconciliation");
  return summary;
}
