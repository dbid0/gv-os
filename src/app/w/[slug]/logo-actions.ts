"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_LOGO_BYTES = 250_000;

/** Store a workspace logo (small data URL, downscaled client-side). */
export async function saveWorkspaceLogo(slug: string, dataUrl: unknown) {
  await requireUser();
  const value = z.string().parse(dataUrl);
  if (!DATA_URL.test(value)) throw new Error("Not an image.");
  if (value.length > MAX_LOGO_BYTES) throw new Error("Logo too large after resize.");
  const db = getDb();
  const updated = await db
    .update(clients)
    .set({ logo: value })
    .where(eq(clients.slug, slug))
    .returning({ id: clients.id });
  if (updated.length === 0) throw new Error("No client row for this slug.");
  revalidatePath(`/w/${slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
