"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { pipelineProspects } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { PIPELINE_STAGES } from "@/lib/pipeline/forecast";

async function requireUser() {
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const dollarsToCents = (n: number) => Math.round(n * 100);

const addInput = z.object({
  name: z.string().min(1).max(160),
  handle: z.string().max(120).optional(),
  niche: z.string().max(80).optional(),
  followers: z.coerce.number().min(0).max(1_000_000_000).optional(),
  setupFeeDollars: z.coerce.number().min(0).max(10_000_000).optional(),
  revSharePct: z.coerce.number().min(0).max(100).optional(),
  estMonthlyRevDollars: z.coerce.number().min(0).max(100_000_000).optional(),
  note: z.string().max(500).optional(),
  ownerName: z.string().max(80).optional(),
});

export async function addProspect(raw: unknown) {
  await requireUser();
  const i = addInput.parse(raw);
  const db = getDb();
  await db.insert(pipelineProspects).values({
    name: i.name.trim(),
    handle: i.handle?.trim() || null,
    niche: i.niche?.trim() || null,
    followers: i.followers ?? null,
    setupFeeCents: dollarsToCents(i.setupFeeDollars ?? 0),
    revShareBps: Math.round((i.revSharePct ?? 0) * 100),
    estMonthlyRevCents: dollarsToCents(i.estMonthlyRevDollars ?? 0),
    note: i.note?.trim() || null,
    ownerName: i.ownerName?.trim() || null,
  });
  revalidatePath("/sales/pipeline");
  return { ok: true };
}

const stageInput = z.object({
  id: z.string().uuid(),
  stage: z.enum(PIPELINE_STAGES),
});

export async function setProspectStage(raw: unknown) {
  await requireUser();
  const i = stageInput.parse(raw);
  const db = getDb();
  const updated = await db
    .update(pipelineProspects)
    .set({ stage: i.stage, updatedAt: new Date() })
    .where(eq(pipelineProspects.id, i.id))
    .returning({ id: pipelineProspects.id });
  if (updated.length === 0) throw new Error("No such prospect.");
  revalidatePath("/sales/pipeline");
  return { ok: true };
}
