"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clientAdSpend, clients } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { parseTargetDollars } from "@/lib/clients/targets";
import { driveFolderIdValid } from "@/lib/google/drive-kind";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

/** Point a client at its Drive root. Empty input clears the link. */
export async function saveDriveFolder(slug: string, rawFolderId: string) {
  await requireUser();
  const folderId = rawFolderId.trim();
  if (folderId && !driveFolderIdValid(folderId)) {
    throw new Error(
      "That doesn't look like a Drive folder id — copy it from the folder's URL.",
    );
  }
  const db = getDb();
  const updated = await db
    .update(clients)
    .set({ driveFolderId: folderId || null })
    .where(eq(clients.slug, slug))
    .returning({ id: clients.id });
  if (updated.length === 0) {
    throw new Error("No client row for this slug yet — sync creates it.");
  }
  revalidatePath(`/clients/${slug}`);
  revalidatePath(`/w/${slug}`);
  return { saved: true };
}

/**
 * Manual trigger: import this offer's New Deals rows into the ledger. Money —
 * idempotent (re-running is safe) and admin-gated. Returns a plain summary.
 */
export async function importOfferDeals(slug: string) {
  await requireUser();
  const { importNewDealsForOffer } = await import("@/lib/sheets/import-new-deals");
  const result = await importNewDealsForOffer(slug);
  revalidatePath(`/clients/${slug}`);
  revalidatePath(`/w/${slug}`);
  revalidatePath("/dashboard");
  revalidatePath("/accounting");
  return result;
}

const SHEET_ID = /^[A-Za-z0-9_-]{20,60}$/;

/** Point this offer at its tracking sheet (the New Deals feed). Empty clears it. */
export async function saveTrackingSheet(slug: string, rawSheetId: string) {
  await requireUser();
  const sheetId = rawSheetId.trim();
  if (sheetId && !SHEET_ID.test(sheetId)) {
    throw new Error(
      "That doesn't look like a Google Sheet id — copy it from the sheet's URL (the part after /d/).",
    );
  }
  const db = getDb();
  const updated = await db
    .update(clients)
    .set({ trackingSheetId: sheetId || null })
    .where(eq(clients.slug, slug))
    .returning({ id: clients.id });
  if (updated.length === 0) {
    throw new Error("No client row for this slug yet — sync creates it.");
  }
  revalidatePath(`/clients/${slug}`);
  revalidatePath(`/w/${slug}`);
  return { saved: true };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Record an offer's ad spend for a day — the cost deducted from cash-after-fees
 * before a "X% after ad spend" rev-share is rated. Append-only: a correction is
 * a new (negative) row, never an edit. Revalidates rev-share + the reconciler.
 */
export async function addAdSpend(
  slug: string,
  occurredOn: string,
  rawAmount: string,
  note: string,
) {
  await requireUser();
  if (!DAY.test(occurredOn)) throw new Error("Pick a date (yyyy-mm-dd).");
  const cleaned = rawAmount.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error("Enter an amount in dollars — like 500 or 1,250.50.");
  }
  const amountCents = Math.round(Number(cleaned) * 100);
  if (amountCents === 0) throw new Error("Amount can't be zero.");
  if (Math.abs(amountCents) > 100_000_000) throw new Error("That amount looks wrong.");

  const db = getDb();
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  if (!client) throw new Error("No client row for this slug yet — sync creates it.");

  await db.insert(clientAdSpend).values({
    clientId: client.id,
    occurredOn,
    amountCents,
    note: note.trim() || null,
  });
  revalidatePath(`/clients/${slug}`);
  revalidatePath("/accounting/revshare");
  revalidatePath("/accounting/reconciliation");
  return { saved: true };
}

const CASH_AUTHORITY_VALUES = ["auto", "forms", "processors"] as const;

/**
 * Set which source owns this offer's cash — the Money Spine switch. `auto`
 * derives it from whether a processor is connected; `forms`/`processors` pin
 * it. Revalidates the reconciler so drift status updates immediately.
 */
export async function saveCashAuthority(slug: string, value: string) {
  await requireUser();
  if (!(CASH_AUTHORITY_VALUES as readonly string[]).includes(value)) {
    throw new Error("Cash authority must be auto, forms, or processors.");
  }
  const db = getDb();
  const updated = await db
    .update(clients)
    .set({ cashAuthority: value })
    .where(eq(clients.slug, slug))
    .returning({ id: clients.id });
  if (updated.length === 0) {
    throw new Error("No client row for this slug yet — sync creates it.");
  }
  revalidatePath(`/clients/${slug}`);
  revalidatePath("/accounting/reconciliation");
  revalidatePath(`/w/${slug}`);
  return { saved: true };
}

/** The roster card summary: a short line, capped so it stays a summary. */
const SUMMARY_MAX = 64;

/**
 * Set this offer's short summary — the one line the Clients card reads (who the
 * creator is comes from the card's owner line). Empty clears it back to the
 * roster default. Capped so it can never grow into a paragraph again.
 */
export async function saveClientSummary(slug: string, rawSummary: string) {
  await requireUser();
  const summary = rawSummary.trim().replace(/\s+/g, " ");
  if (summary.length > SUMMARY_MAX) {
    throw new Error(`Keep it short — ${SUMMARY_MAX} characters or fewer.`);
  }
  const db = getDb();
  const updated = await db
    .update(clients)
    .set({ summary: summary || null })
    .where(eq(clients.slug, slug))
    .returning({ id: clients.id });
  if (updated.length === 0) {
    throw new Error("No client row for this slug yet — sync creates it.");
  }
  revalidatePath("/clients");
  revalidatePath(`/clients/${slug}`);
  revalidatePath(`/w/${slug}`);
  return { saved: true };
}

/** Set the client's monthly cash target in dollars. Empty input clears it. */
export async function saveMonthlyTarget(slug: string, rawDollars: string) {
  await requireUser();
  const parsed = parseTargetDollars(rawDollars);
  if (parsed === "invalid") {
    throw new Error("Enter the target in dollars — like 25000 or $25,000.");
  }
  const db = getDb();
  const updated = await db
    .update(clients)
    .set({ monthlyTargetCents: parsed })
    .where(eq(clients.slug, slug))
    .returning({ id: clients.id });
  if (updated.length === 0) {
    throw new Error("No client row for this slug yet — sync creates it.");
  }
  revalidatePath(`/clients/${slug}`);
  revalidatePath(`/w/${slug}`);
  return { saved: true };
}
