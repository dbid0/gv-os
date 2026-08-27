"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { shellUser } from "@/lib/auth/user";
import { setPref } from "@/lib/prefs";

import { SALES_METRIC_IDS } from "@/lib/sales/metrics";

const input = z.array(z.enum(SALES_METRIC_IDS)).max(SALES_METRIC_IDS.length);

/** Persist the user's sales-metrics wall (ordered metric ids). */
export async function saveSalesMetrics(raw: unknown) {
  const ids = input.parse(raw);
  const user = await shellUser();
  await setPref(user?.email ?? null, "sales-metrics", ids);
  revalidatePath("/dashboard");
  return { ok: true };
}
