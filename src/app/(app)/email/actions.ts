"use server";

import { revalidatePath } from "next/cache";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullKitSnapshots } from "@/lib/email/kit-sync";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

export async function syncKitNow() {
  await requireUser();
  const results = await pullKitSnapshots();
  revalidatePath("/email");
  return { connections: results.length };
}
