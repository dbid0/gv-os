import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { Kpi } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { cents, formatUSD } from "@/lib/money";
import { clientBySlug } from "@/lib/roster";
import { transcriptByShareUrl } from "@/lib/calls/share-transcripts";
import { currentSnapshot, leadByEmail } from "@/lib/tracking/queries";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  applications: "Applied",
  calls: "Call booked",
  eoc: "End-of-call report",
  deals: "Deal logged",
  payments: "Payment",
  ar: "Accounts receivable",
};

/**
 * One lead's whole journey through the offer.
 *
 * Assembled from every tab that names this email, oldest first. Rows with no
 * date still appear, ordered by funnel stage — The Grid's Calls Log is 94%
 * undated, and dropping those rows would hide most of its booked calls.
 *
 * The end-of-call report is the centre of gravity: it carries the closer's own
 * account of what happened and the recording link, which is where the
 * transcript read starts.
 */
export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ slug: string; email: string }>;
}) {
  const { slug, email: raw } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();
  const email = decodeURIComponent(raw);

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  if (!row) notFound();

  const snapshot = await currentSnapshot(row.id);
  const lead = snapshot ? await leadByEmail(snapshot.syncId, email) : null;
  if (!lead) notFound();

  // The transcript behind each recording link, when it has been pulled. Keyed
  // by URL so an event can show the call itself, not just a link away to it.
  const transcripts = new Map(
    (
      await Promise.all(
        lead.events
          .map((e) => e.recordingUrl)
          .filter((u): u is string => Boolean(u))
          .map(async (u) => [u, await transcriptByShareUrl(u)] as const),
      )
    ).filter(([, v]) => v !== null),
  );

  return (
    <div className="space-y-6">
      <Link
        href={`/w/${slug}/leads`}
        className="text-faint hover:text-foreground inline-flex items-center gap-1.5 text-xs"
      >
        <ArrowLeft className="size-3.5" /> All leads
      </Link>

      <div>
        <h2 className="text-xl font-semibold">{lead.name ?? lead.email}</h2>
        <p className="text-muted-foreground text-sm">{lead.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Touchpoints" value={String(lead.events.length)} tone="brand" />
        <Kpi label="Calls" value={String(lead.callsBooked || "—")} />
        <Kpi label="EOC reports" value={String(lead.eocReports || "—")} />
        <Kpi
          label="Payments logged"
          value={lead.paymentsCents > 0 ? formatUSD(cents(lead.paymentsCents)) : "—"}
        />
      </div>

      <Panel
        title="Journey"
        aside={
          <span className="text-faint text-xs">
            {lead.reps.length > 0 ? lead.reps.join(" · ") : "no rep recorded"}
          </span>
        }
      >
        <ol className="space-y-4">
          {lead.events.map((e, i) => (
            <li key={`${e.tab}-${e.rowIndex}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="bg-brand/70 mt-1.5 size-2 shrink-0 rounded-full" />
                {i < lead.events.length - 1 && (
                  <span className="bg-border mt-1 w-px flex-1" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-sm font-medium">
                    {STAGE_LABEL[e.tab] ?? e.tab}
                  </span>
                  <span className="text-faint text-xs">
                    {e.occurredAt
                      ? e.occurredAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : /* Honest about the gap rather than inventing a date. */
                        "no date on the row"}
                  </span>
                  {e.rep && <span className="text-faint text-xs">{e.rep}</span>}
                </div>

                {(e.status ?? e.outcome) && (
                  <p className="mt-0.5 text-sm">{e.status ?? e.outcome}</p>
                )}

                {e.cashCents !== null && e.cashCents > 0 && (
                  <p className="numeric text-success mt-0.5 text-sm">
                    {formatUSD(cents(e.cashCents))}
                  </p>
                )}

                {e.notes && (
                  <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
                    {e.notes}
                  </p>
                )}

                {e.recordingUrl && (
                  <div className="mt-1.5 space-y-1.5">
                    <a
                      href={e.recordingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand inline-block text-xs hover:underline"
                    >
                      Recording →
                    </a>
                    {(() => {
                      const call = transcripts.get(e.recordingUrl!);
                      // Honest: the link is known, the transcript is not here
                      // yet. No summary is invented in its place.
                      return call ? (
                        <CallRead call={call} />
                      ) : (
                        <p className="text-faint text-xs">
                          Transcript not pulled yet — run it from Tracking.
                        </p>
                      );
                    })()}
                  </div>
                )}

                {Object.keys(e.payload).length > 0 && (
                  <details className="mt-1.5">
                    <summary className="text-faint cursor-pointer text-xs">
                      Row {e.rowIndex} on the sheet
                    </summary>
                    <dl className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {Object.entries(e.payload).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <dt className="text-faint inline">{k}: </dt>
                          <dd className="text-muted-foreground inline">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

/**
 * The read on one call: why it went the way it did, then the transcript.
 *
 * The outcome sits OUTSIDE the fold and the transcript inside it, because the
 * answer is the reason a manager opened this — the 50,000-character transcript
 * is the evidence, not the answer. A call whose read failed says so; nothing
 * is summarised on its behalf.
 */
function CallRead({
  call,
}: {
  call: {
    title: string | null;
    transcript: string | null;
    durationSeconds: number | null;
    analysisStatus: string;
    analysisOutcome: string | null;
    analysis: Record<string, unknown>;
  };
}) {
  const read = call.analysis as {
    objections?: string[];
    missedSteps?: string[];
    coaching?: string[];
    nextStep?: string | null;
  };
  const done = call.analysisStatus === "done" && call.analysisOutcome;

  return (
    <div className="bg-card/50 space-y-2.5 rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium">
          {call.title ?? "Call"}
          {call.durationSeconds
            ? ` · ${Math.round(call.durationSeconds / 60)} min`
            : ""}
        </span>
        {call.analysisStatus === "failed" && (
          <span className="text-warning text-xs">read failed</span>
        )}
      </div>

      {done ? (
        <>
          <p className="text-sm">{call.analysisOutcome}</p>
          <ReadList label="Objections raised" items={read.objections} />
          <ReadList label="Steps missed" items={read.missedSteps} />
          <ReadList label="Coaching" items={read.coaching} />
          {read.nextStep && (
            <p className="text-muted-foreground text-xs">
              <span className="text-faint">Next step: </span>
              {read.nextStep}
            </p>
          )}
        </>
      ) : (
        <p className="text-faint text-xs">
          {call.analysisStatus === "failed"
            ? "The read did not come back usable, so nothing is shown for it. The transcript is below."
            : "Not read yet. The transcript is below."}
        </p>
      )}

      {call.transcript && (
        <details>
          <summary className="text-faint cursor-pointer text-xs">
            Full transcript
          </summary>
          <pre className="text-muted-foreground mt-2 max-h-96 overflow-auto text-xs whitespace-pre-wrap">
            {call.transcript}
          </pre>
        </details>
      )}
    </div>
  );
}

function ReadList({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-faint text-xs">{label}</p>
      <ul className="mt-0.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="text-muted-foreground text-xs">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
