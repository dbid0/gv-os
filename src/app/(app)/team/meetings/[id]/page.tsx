import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { buttonVariants } from "@/components/ui/button";
import { clientBySlug } from "@/lib/roster";
import { getMeeting } from "@/lib/meetings/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  agency_call: "Agency call",
  client_call: "Client call",
  manual: "Note",
};

function longDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const m = await getMeeting(id);
  if (!m) notFound();

  const accent = m.clientSlug ? (clientBySlug(m.clientSlug)?.accent ?? null) : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title={m.title}
        description={longDate(m.meetingDate)}
        actions={
          <Link
            href="/team/meetings"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> Meetings
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{SOURCE_LABEL[m.source] ?? m.source}</Badge>
        {m.clientName && (
          <span
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: accent ?? "var(--brand)" }}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: accent ?? "var(--brand)" }}
            />
            {m.clientName}
          </span>
        )}
        {m.attendees.length > 0 && (
          <span className="text-faint text-xs">{m.attendees.join(" · ")}</span>
        )}
        {m.docLink && (
          <a
            href={m.docLink}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs"
          >
            Full notes + transcript in Drive <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {m.summary && (
        <Panel title="Recap">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.summary}</p>
        </Panel>
      )}

      {m.actionItems.length > 0 && (
        <Panel
          title="Action items"
          aside={
            <span className="text-faint text-xs">{m.taskCount} on the Work board</span>
          }
        >
          <div className="space-y-4">
            {m.actionItems.map((it, i) => (
              <div key={i}>
                <p className="text-sm font-medium">{it.person || "Team"}</p>
                <ul className="mt-1 space-y-1">
                  {it.tasks.map((t, j) => (
                    <li key={j} className="text-muted-foreground flex gap-2 text-sm">
                      <span className="text-faint">☐</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {m.hasTranscript && (
        <Panel title="Transcript">
          <details className="group">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm select-none">
              Show verbatim transcript
            </summary>
            <pre className="text-muted-foreground mt-3 max-h-[32rem] overflow-auto rounded-lg border p-3 text-xs leading-relaxed whitespace-pre-wrap">
              {m.transcript}
            </pre>
          </details>
        </Panel>
      )}
    </div>
  );
}
