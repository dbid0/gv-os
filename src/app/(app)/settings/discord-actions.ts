"use server";

import { isAllowed } from "@/lib/auth/allowlist";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { currentUser } from "@/lib/auth/server";
import { dayKeyCT } from "@/lib/charts";
import { getAgencyReconciliation } from "@/lib/accounting/reconcile-agency-query";
import { getSpineReconciliation } from "@/lib/accounting/reconcile-spine-query";
import { buildAgencySnapshotEmbed, buildTestMessage } from "@/lib/discord/embed";
import { buildDigestMessage } from "@/lib/discord/digest";
import { postToAgencyDiscord } from "@/lib/discord/webhook";
import { roster } from "@/lib/roster";
import { computeFunnel } from "@/lib/sales/funnel";
import { getLeaderboard } from "@/lib/sales/queries";
import { partialDealAr } from "@/lib/transactions/ar";
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

/**
 * Post the huddle digest: month cash, the funnel, top reps, AR owed, and a red
 * flag if the reconciler is drifting. No rep pay — a team broadcast, not the
 * private accounting side.
 */
export async function postDigest() {
  await requireAdmin();
  const now = new Date();
  const month = dayKeyCT(now).slice(0, 7);
  const monthLabel = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/Chicago",
  });

  const [{ rows }, leaderboard, spine, agency] = await Promise.all([
    listTransactions({}),
    getLeaderboard(),
    getSpineReconciliation(),
    getAgencyReconciliation(),
  ]);

  const { collectedCents } = homeHeadline(rows, "all", month);
  const funnel = computeFunnel(
    leaderboard.map((r) => ({
      repId: r.repId,
      name: r.name,
      teamName: r.teamName,
      setsBooked: r.setsBooked,
      shows: r.shows,
      deals: r.dealsClosed,
    })),
  );
  const topReps = [...leaderboard]
    .sort((a, b) => b.cashCents - a.cashCents)
    .slice(0, 5)
    .filter((r) => r.cashCents > 0 || r.dealsClosed > 0)
    .map((r) => ({ name: r.name, cashCents: r.cashCents, deals: r.dealsClosed }));
  const arOwedCents = partialDealAr(rows).reduce((s, i) => s + i.arCents, 0);

  await postToAgencyDiscord(
    buildDigestMessage({
      monthLabel,
      monthCashCents: collectedCents,
      topReps,
      funnel: {
        setsBooked: funnel.setsBooked,
        shows: funnel.shows,
        deals: funnel.deals,
        closeRatePct: funnel.closeRatePct,
      },
      arOwedCents,
      driftCount: spine.driftCount + agency.driftCount,
      driftTotalCents: spine.totalCashDriftCents + agency.totalDriftCents,
    }),
  );
  return { sent: true };
}
