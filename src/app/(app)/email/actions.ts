"use server";

import { revalidatePath } from "next/cache";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullKitSnapshots } from "@/lib/email/kit-sync";

async function requireUser() {
  // Build phase: auth is off (see middleware DISABLE_AUTH).
  if (process.env.DISABLE_AUTH === "true") return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

export async function syncKitNow() {
  await requireUser();
  const results = await pullKitSnapshots();
  revalidatePath("/email");
  return { connections: results.length };
}
