import "server-only";

import { type AiViewer } from "@/lib/ai/context";
import { type AiAnswer, type AiRequest } from "@/lib/ai/types";
import {
  type QuickAnswer,
  type RepQuotaSnapshot,
  answerBehindPace,
  answerCloseRate,
  answerMissedEod,
  answerMomentum,
  answerNetThisMonth,
  answerPayoutOwed,
  answerRepEarnings,
  answerRepPacing,
  answerRepQuotaGap,
  answerRepStreak,
  answerWhatsFailing,
  answerWhoOwes,
} from "@/lib/ai/quick-answers";
import { getAiProvider } from "@/lib/ai/provider";
import { matchToolId } from "@/lib/ai/router";
import { aiFace } from "@/lib/ai/roles";
import { canRunTool, toolById } from "@/lib/ai/tools";
// Existing read layers — imported READ-ONLY. Never modified here.
import { getRepGamification, listRepMomentum } from "@/lib/gamification/queries";
import { mirrorOutstanding, currentMonthCashCents } from "@/lib/accounting/sheet-sync";
import { listIntegrations } from "@/lib/integrations/queries";
import { isFailureNote } from "@/lib/integrations/sync-note";
import {
  getCommissionRollup,
  getEodCompliance,
  getLeaderboard,
  listReps,
} from "@/lib/sales/queries";
import { listQuotasWithPacing, type QuotaRow } from "@/lib/sales/quota-queries";

/**
 * The answer service: a tool id in, a real answer out.
 *
 * This is the thin, server-only adapter between the assistant and the app's
 * existing read layers. It fetches the rows a tool needs, hands them to the
 * matching PURE compute in `quick-answers.ts`, and returns the formatted
 * result. It imports the quota / gamification / commission / ledger / accounting
 * reads READ-ONLY and modifies none of them.
 *
 * Capability is re-checked here as defense-in-depth: even though the UI only
 * ever offers a viewer their permitted starters, a tool the role does not
 * unlock is refused before any query runs.
 */

function monthLabel(now: Date): string {
  return now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Flatten a rep-scoped quota row into the pure compute's shape. */
function toRepSnapshot(row: QuotaRow): RepQuotaSnapshot {
  return {
    metricLabel: row.metricLabel,
    isMoney: row.isMoney,
    actualSoFar: row.actualSoFar,
    targetAmount: row.targetAmount,
    status: row.pacing.status,
    remaining: row.pacing.remaining,
    attainmentPct: row.pacing.attainmentPct,
    elapsedFraction: row.pacing.elapsedFraction,
  };
}

/** The viewer's most-recent active rep quota, or null. */
function pickRepQuota(rows: QuotaRow[], repId: string): RepQuotaSnapshot | null {
  const mine = rows.find((r) => r.scope === "rep" && r.repId === repId && !r.isPast);
  return mine ? toRepSnapshot(mine) : null;
}

/** Compute a rep-scoped answer, honest when the viewer has no linked rep. */
async function repAnswer(
  viewer: AiViewer,
  toolId: string,
  nowMs: number,
): Promise<QuickAnswer> {
  const repName = viewer.repName ?? viewer.displayName;
  if (!viewer.repId) {
    return {
      headline: `You're not linked to a rep, ${viewer.displayName}.`,
      details: ["Personal numbers appear once a rep profile is linked to you."],
    };
  }

  if (toolId === "rep.streak") {
    const view = await getRepGamification(viewer.repId);
    if (!view) {
      return {
        headline: `No activity logged yet, ${repName}.`,
        details: ["Log a call or file an EOD to start your streak."],
      };
    }
    return answerRepStreak({
      repName,
      current: view.gamification.streak.current,
      longest: view.gamification.streak.longest,
      hasActivity: view.gamification.hasActivity,
    });
  }

  if (toolId === "rep.earnings") {
    const rollup = await getCommissionRollup();
    const line = rollup.reps.find((r) => r.repId === viewer.repId);
    return answerRepEarnings({
      repName,
      owedCents: line?.totalOwedCents ?? 0,
      dealCount: line?.run.dealCount ?? 0,
      hasLine: Boolean(line),
    });
  }

  // rep.pacing and rep.quota_gap both read the rep's active quota.
  const quotas = await listQuotasWithPacing(nowMs);
  const snapshot = pickRepQuota(quotas, viewer.repId);
  return toolId === "rep.quota_gap"
    ? answerRepQuotaGap({ repName, quota: snapshot })
    : answerRepPacing({ repName, quota: snapshot });
}

/** Compute a manager (team-scoped) answer. */
async function teamAnswer(
  viewer: AiViewer,
  toolId: string,
  nowMs: number,
): Promise<QuickAnswer> {
  if (toolId === "team.behind_pace") {
    const rows = await listQuotasWithPacing(nowMs);
    const scoped = viewer.clientId
      ? rows.filter((r) => r.clientId === viewer.clientId)
      : rows;
    return answerBehindPace(
      scoped
        .filter((r) => !r.isPast)
        .map((r) => ({
          label:
            r.scope === "rep"
              ? (r.repName ?? "Unassigned")
              : `${r.teamName ?? "Team"} (team)`,
          metricLabel: r.metricLabel,
          status: r.pacing.status,
          remaining: r.pacing.remaining,
          isMoney: r.isMoney,
        })),
    );
  }

  if (toolId === "team.missed_eod") {
    const eod = await getEodCompliance();
    return answerMissedEod({
      asOfLabel: eod.asOf ? dayLabel(eod.asOf) : null,
      missing: eod.missing,
      submitted: eod.submitted,
      total: eod.total,
    });
  }

  if (toolId === "team.close_rate") {
    const board = await getLeaderboard();
    const shows = board.reduce((n, r) => n + r.shows, 0);
    const deals = board.reduce((n, r) => n + r.dealsClosed, 0);
    return answerCloseRate({
      pct: shows ? Math.round((deals / shows) * 100) : null,
      shows,
      deals,
    });
  }

  // team.momentum
  const momentum = await listRepMomentum();
  return answerMomentum(
    momentum.map((m) => ({
      name: m.name,
      currentStreak: m.currentStreak,
      longestStreak: m.longestStreak,
    })),
  );
}

/** Compute an admin (agency-wide) answer. */
async function adminAnswer(toolId: string, now: Date): Promise<QuickAnswer> {
  if (toolId === "admin.net_month") {
    const cents = await currentMonthCashCents();
    return answerNetThisMonth({ cents, monthLabel: monthLabel(now) });
  }

  if (toolId === "admin.whats_failing") {
    const connections = await listIntegrations();
    return answerWhatsFailing(
      connections
        .filter((c) => isFailureNote(c.lastSyncNote))
        .map((c) => ({ label: c.label, note: c.lastSyncNote ?? "sync failed" })),
    );
  }

  if (toolId === "admin.outstanding_ar") {
    const { rows, totalArCents } = await mirrorOutstanding();
    return answerWhoOwes({
      rows: rows.map((r) => ({ client: r.client, arCents: r.arCents })),
      totalArCents,
    });
  }

  // admin.payout_owed
  const [rollup, reps] = await Promise.all([getCommissionRollup(), listReps()]);
  const nameById = new Map(reps.map((r) => [r.id, r.name]));
  return answerPayoutOwed({
    reps: rollup.reps.map((r) => ({
      name: nameById.get(r.repId) ?? "Unknown rep",
      owedCents: r.totalOwedCents,
    })),
    totalOwedCents: rollup.totalOwedCents,
  });
}

/** Run one resolved tool for a viewer. Assumes the capability check passed. */
async function runTool(viewer: AiViewer, toolId: string): Promise<QuickAnswer> {
  const now = new Date();
  const nowMs = now.getTime();
  if (toolId.startsWith("rep.")) return repAnswer(viewer, toolId, nowMs);
  if (toolId.startsWith("team.")) return teamAnswer(viewer, toolId, nowMs);
  return adminAnswer(toolId, now);
}

/**
 * The one entry point the action calls. Resolves the request to a permitted
 * read tool and computes it; when nothing maps, returns the stubbed provider's
 * honest go-live message instead of guessing.
 */
export async function answer(viewer: AiViewer, request: AiRequest): Promise<AiAnswer> {
  // A tapped starter names its tool directly; a typed question is routed.
  const requested =
    request.toolId ??
    (request.text ? (matchToolId(viewer.role, request.text) ?? undefined) : undefined);

  const tool = requested ? toolById(requested) : undefined;

  if (tool && canRunTool(viewer.role, tool.id)) {
    const result = await runTool(viewer, tool.id);
    return {
      headline: result.headline,
      details: result.details,
      toolId: tool.id,
      capability: tool.capability,
      unlockedByLlm: false,
    };
  }

  // No confident, permitted match — hand to the stubbed provider.
  const provider = getAiProvider();
  const face = aiFace(viewer.role);
  const completion = await provider.complete({
    face: face.name,
    system: `You are ${face.name}, the GV OS assistant for a ${viewer.role}.`,
    messages: [{ role: "user", content: request.text ?? "" }],
  });
  return {
    headline: completion.text,
    details: [],
    toolId: null,
    capability: null,
    unlockedByLlm: completion.unlocked,
  };
}
