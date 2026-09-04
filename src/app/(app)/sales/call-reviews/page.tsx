import Link from "next/link";
import { eq } from "drizzle-orm";

import { ReviewActions } from "@/components/sales/review-actions";
import { Kpi } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { callRecordings } from "@/db/schema/app";
import { getViewerScope } from "@/lib/home/viewer-scope";
import { scopeRowsToViewer } from "@/lib/home/visibility";
import { reviewQueue } from "@/lib/calls/review-queue";
import type { CallResult } from "@/lib/calls/review";

export const metadata = { title: "Call reviews - GV OS" };
export const dynamic = "force-dynamic";

const RESULT_TONE: Record<CallResult, StatusTone> = {
  won: "good",
  // Still winnable: the prospect is live and the follow-up hasn't happened.
  stalled: "progress",
  lost: "danger",
  unknown: "muted",
};

/**
 * The sales manager's call-review inbox.
 *
 * Every recorded call gets read; this is the small subset worth a manager's
 * time — a deal still open with steps missed on it, or one lost with
 * objections that were never handled. A won call never appears, and neither
 * does a read that found nothing to act on: a queue that contains everything
 * has told the manager nothing.
 *
 * Ordered by how recoverable it is, not by when it happened. A stalled call
 * outranks a lost one because the prospect is still live.
 */
export default async function CallReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const showCleared = show === "cleared";

  const [queue, scope] = await Promise.all([
    reviewQueue({ includeReviewed: showCleared, limit: 200 }),
    getViewerScope(),
  ]);
  const visible = scopeRowsToViewer(queue, (r) => r.clientId, scope.allowed);

  // The read itself, for the rows on screen.
  const db = getDb();
  const details = new Map(
    await Promise.all(
      visible.slice(0, 50).map(async (r) => {
        const [row] = await db
          .select({
            outcome: callRecordings.analysisOutcome,
            analysis: callRecordings.analysis,
            reviewedAt: callRecordings.reviewedAt,
          })
          .from(callRecordings)
          .where(eq(callRecordings.id, r.recordingId))
          .limit(1);
        return [r.recordingId, row] as const;
      }),
    ),
  );

  const stalled = visible.filter((r) => r.result === "stalled").length;
  const lost = visible.filter((r) => r.result === "lost").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Waiting on you" value={String(visible.length)} tone="brand" />
        <Kpi label="Still winnable" value={String(stalled)} />
        <Kpi label="Lost with objections" value={String(lost)} />
      </div>

      <Panel
        title={showCleared ? "Every reviewed call" : "Calls that need a look"}
        aside={
          <Link
            href={
              showCleared ? "/sales/call-reviews" : "/sales/call-reviews?show=cleared"
            }
            className="text-faint hover:text-foreground text-xs"
          >
            {showCleared ? "show only what's waiting" : "include cleared"}
          </Link>
        }
      >
        {visible.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">Nothing waiting.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {scope.restricted
                ? "No calls on your offer need a review right now."
                : "Every call that needed a look has been cleared. New ones appear here as calls are read."}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {visible.slice(0, 50).map((r) => {
              const d = details.get(r.recordingId);
              const a = (d?.analysis ?? {}) as {
                objections?: string[];
                missedSteps?: string[];
                coaching?: string[];
                nextStep?: string | null;
              };
              return (
                <div
                  key={r.recordingId}
                  className="border-b pb-5 last:border-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm font-medium">
                          {r.rep ?? "Unknown rep"}
                        </span>
                        <StatusPill tone={RESULT_TONE[r.result]}>
                          {r.result === "unknown" ? "no outcome" : r.result}
                        </StatusPill>
                        {r.leadEmail && r.clientSlug && (
                          <Link
                            href={`/w/${r.clientSlug}/leads/${encodeURIComponent(r.leadEmail)}`}
                            className="text-brand text-xs hover:underline"
                          >
                            {r.leadEmail}
                          </Link>
                        )}
                        <span className="text-faint text-xs">
                          {r.occurredAt
                            ? r.occurredAt.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "no date"}
                        </span>
                      </div>
                      {r.decision.reason && (
                        <p className="text-warning mt-1 text-xs">{r.decision.reason}</p>
                      )}
                    </div>
                    <ReviewActions
                      recordingId={r.recordingId}
                      reviewed={Boolean(d?.reviewedAt)}
                    />
                  </div>

                  {d?.outcome && <p className="mt-2 text-sm">{d.outcome}</p>}

                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <ReadColumn label="Steps missed" items={a.missedSteps} />
                    <ReadColumn label="Coaching" items={a.coaching} />
                  </div>

                  {a.nextStep && (
                    <p className="text-muted-foreground mt-2 text-xs">
                      <span className="text-faint">Next step: </span>
                      {a.nextStep}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ReadColumn({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-faint text-xs">{label}</p>
      <ul className="mt-0.5 space-y-1">
        {items.slice(0, 3).map((item) => (
          <li key={item} className="text-muted-foreground text-xs">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
