/** The admin dashboard card catalog (v2, Whop-style editable dashboard). */
export const DASHBOARD_CARD_IDS = [
  "sales-engine",
  "ar-owed",
  "pending-payouts",
  "kit-subscribers",
] as const;
export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];

export const DASHBOARD_CARD_META: Record<
  DashboardCardId,
  { title: string; detail: string }
> = {
  "sales-engine": {
    title: "Sales engine",
    detail: "Cash, revenue, deals, close rate, EOD compliance",
  },
  "ar-owed": { title: "Owed to GV", detail: "Open receivables with aging" },
  "pending-payouts": {
    title: "Pending payouts",
    detail: "This month's unpaid payout total",
  },
  "kit-subscribers": {
    title: "Email lists",
    detail: "Total Kit subscribers across clients",
  },
};

export const DEFAULT_DASHBOARD_CARDS: DashboardCardId[] = ["sales-engine"];

export function normalizeDashboardCards(value: unknown): DashboardCardId[] {
  if (!Array.isArray(value)) return DEFAULT_DASHBOARD_CARDS;
  const valid = value.filter((v): v is DashboardCardId =>
    (DASHBOARD_CARD_IDS as readonly string[]).includes(v as string),
  );
  return valid.length > 0 ? [...new Set(valid)] : DEFAULT_DASHBOARD_CARDS;
}
