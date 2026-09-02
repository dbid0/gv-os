import "server-only";

import { and, desc, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { activityLogs, callRecordings, clients } from "@/db/schema/app";
import { getAiProvider } from "@/lib/ai/provider";
import {
  buildAnalysisPrompt,
  CALL_ANALYSIS_SYSTEM,
  parseCallAnalysis,
  shouldEscalate,
} from "@/lib/calls/call-analysis";

/**
 * Running the call read over recordings that have a transcript but no verdict.
 *
 * The judgement (prompt, parsing, what deserves a manager's attention) lives in
 * the pure `call-analysis.ts`; this file only moves data and talks to the model.
 *
 * Two states are recorded honestly rather than hidden:
 *   • the AI provider is not wired yet → recordings are left "pending", NOT
 *     marked failed, so they are picked up automatically at go-live;
 *   • the model replied but did not say what happened → "failed", so a bad read
 *     is never stored as if it were a real one.
 */

export interface AnalysisRunResult {
  considered: number;
  analyzed: number;
  failed: number;
  escalated: number;
  /** Set when the provider is still stubbed — the honest "not wired" state. */
  skippedReason?: string;
}

export async function analyzePendingCalls(limit = 10): Promise<AnalysisRunResult> {
  const db = getDb();
  const provider = getAiProvider();

  const pending = await db
    .select({
      id: callRecordings.id,
      clientId: callRecordings.clientId,
      activityLogId: callRecordings.activityLogId,
      title: callRecordings.title,
      transcript: callRecordings.transcript,
    })
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.analysisStatus, "pending"),
        isNotNull(callRecordings.transcript),
      ),
    )
    .orderBy(desc(callRecordings.occurredAt))
    .limit(limit);

  const result: AnalysisRunResult = {
    considered: pending.length,
    analyzed: 0,
    failed: 0,
    escalated: 0,
  };
  if (pending.length === 0) return result;

  // No live model yet: leave everything pending so it runs itself at go-live.
  if (!provider.unlocked) {
    result.skippedReason = "AI provider is not wired yet — reads run at go-live.";
    return result;
  }

  for (const rec of pending) {
    try {
      // The call's own context, so the read is judged against the real outcome.
      let disposition: string | null = null;
      let customerName: string | null = null;
      if (rec.activityLogId) {
        const [log] = await db
          .select({
            disposition: activityLogs.disposition,
            customerName: activityLogs.customerName,
          })
          .from(activityLogs)
          .where(eq(activityLogs.id, rec.activityLogId))
          .limit(1);
        disposition = log?.disposition ?? null;
        customerName = log?.customerName ?? null;
      }
      let offerName: string | null = null;
      if (rec.clientId) {
        const [c] = await db
          .select({ name: clients.name })
          .from(clients)
          .where(eq(clients.id, rec.clientId))
          .limit(1);
        offerName = c?.name ?? null;
      }

      const completion = await provider.complete({
        face: "Coach",
        system: CALL_ANALYSIS_SYSTEM,
        messages: [
          {
            role: "user",
            content: buildAnalysisPrompt(rec.transcript ?? "", {
              disposition,
              customerName,
              offerName,
            }),
          },
        ],
      });

      const analysis = completion.ok ? parseCallAnalysis(completion.text) : null;
      if (!analysis) {
        result.failed += 1;
        await db
          .update(callRecordings)
          .set({
            analysisStatus: "failed",
            analyzedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(callRecordings.id, rec.id));
        continue;
      }

      await db
        .update(callRecordings)
        .set({
          analysisStatus: "done",
          analysisOutcome: analysis.outcome,
          analysis: analysis as unknown as Record<string, unknown>,
          analyzedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(callRecordings.id, rec.id));
      result.analyzed += 1;
      if (shouldEscalate(disposition, analysis)) result.escalated += 1;
    } catch {
      result.failed += 1;
      await db
        .update(callRecordings)
        .set({
          analysisStatus: "failed",
          analyzedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(callRecordings.id, rec.id))
        .catch(() => {});
    }
  }

  return result;
}

/** Reads worth a manager's attention: a lost or stalled call with coaching on it. */
export async function listEscalatedCallReads(limit = 20) {
  const db = getDb();
  const rows = await db
    .select({
      id: callRecordings.id,
      clientId: callRecordings.clientId,
      title: callRecordings.title,
      outcome: callRecordings.analysisOutcome,
      analysis: callRecordings.analysis,
      occurredAt: callRecordings.occurredAt,
      disposition: activityLogs.disposition,
      customerName: activityLogs.customerName,
      repId: activityLogs.repId,
    })
    .from(callRecordings)
    .leftJoin(activityLogs, eq(callRecordings.activityLogId, activityLogs.id))
    .where(eq(callRecordings.analysisStatus, "done"))
    .orderBy(desc(callRecordings.occurredAt))
    .limit(limit);

  return rows.filter((r) => {
    const a = r.analysis as { objections?: unknown; coaching?: unknown } | null;
    return shouldEscalate(r.disposition ?? null, {
      outcome: r.outcome ?? "",
      objections: Array.isArray(a?.objections) ? (a!.objections as string[]) : [],
      missedSteps: [],
      coaching: Array.isArray(a?.coaching) ? (a!.coaching as string[]) : [],
      nextStep: null,
    });
  });
}
