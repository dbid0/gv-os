"use server";

import { isAllowed } from "@/lib/auth/allowlist";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { currentUser } from "@/lib/auth/server";
import { dayKeyCT } from "@/lib/charts";
import { buildAgencySnapshotEmbed, buildTestMessage } from "@/lib/discord/embed";
import { postToAgencyDiscord } from "@/lib/discord/webhook";
import { roster } from "@/lib/roster";
import { homeHeadline } from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";

/**
 * Agency Discord sync — MANUAL triggers only (buttons in Settings), never a
 * cron. Admin-gated; the webhook URL is read sealed from the vault by the
 * sender. Posting is the only side effect and it is always a person clicking.
 */

async function requireAdmin() {
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

/** Prove the pipe: a one-line "we're connected" message to the agency channel. */
export async function sendDiscordTest() {
  await requireAdmin();
  await postToAgencyDiscord(buildTestMessage());
  return { sent: true };
}

/** Post the current agency snapshot (this month's cash, revenue, deals). */
export async function sendAgencySnapshot() {
  await requireAdmin();
  const { rows } = await listTransactions({});
  const now = new Date();
  const month = dayKeyCT(now).slice(0, 7);
  const { collectedCents, revenueCents } = homeHeadline(rows, "all", month);
  const dealsClosed = rows.filter(
    (r) => r.direction === "in" && r.occurredOn.slice(0, 7) === month,
  ).length;
  const monthLabel = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/Chicago",
  });
  await postToAgencyDiscord(
    buildAgencySnapshotEmbed({
      monthLabel,
      monthCashCents: collectedCents,
      totalRevenueCents: revenueCents,
      dealsClosed,
      activeClients: roster.length,
      isoTimestamp: now.toISOString(),
    }),
  );
  return { sent: true };
}
