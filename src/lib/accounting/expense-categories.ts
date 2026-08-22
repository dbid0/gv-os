/** Agency expense categories (v2 §2.6) — shared by the form and the action. */
export const EXPENSE_CATEGORIES = [
  "software",
  "tools",
  "contractors",
  "ads",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
