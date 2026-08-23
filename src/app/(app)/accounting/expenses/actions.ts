"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { agencyExpenses, transactions } from "@/db/schema/app";
import { EXPENSE_CATEGORIES } from "@/lib/accounting/expense-categories";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const input = z.object({
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(200),
  category: z.enum(EXPENSE_CATEGORIES),
  amountDollars: z.coerce.number().gt(0).max(10_000_000),
  notes: z.string().max(500).optional(),
});

/**
 * An expense is money already spent: the metadata row and the backlog
 * out-row are written together, idempotent on the expense id — the agency
 * chain's "other out" leg picks it up with no further wiring.
 */
export async function addExpense(raw: unknown) {
  await requireUser();
  const data = input.parse(raw);
  const db = getDb();
  const amountCents = Math.round(data.amountDollars * 100);

  const [expense] = await db
    .insert(agencyExpenses)
    .values({
      occurredOn: data.occurredOn,
      label: data.label,
      category: data.category,
      amountCents,
      notes: data.notes?.trim() || null,
    })
    .returning({ id: agencyExpenses.id });

  const [txn] = await db
    .insert(transactions)
    .values({
      occurredOn: data.occurredOn,
      direction: "out",
      layer: "agency",
      dealType: "Expense",
      description: `${data.label} (${data.category})`,
      cashCents: amountCents,
      source: "manual",
      idempotencyKey: `expense:${expense.id}`,
      notes: data.notes?.trim() || null,
    })
    .onConflictDoNothing({ target: [transactions.idempotencyKey] })
    .returning({ id: transactions.id });

  if (txn) {
    await db
      .update(agencyExpenses)
      .set({ transactionId: txn.id })
      .where(eq(agencyExpenses.id, expense.id));
  }
  revalidatePath("/accounting/expenses");
  revalidatePath("/accounting");
  return { ok: true };
}
