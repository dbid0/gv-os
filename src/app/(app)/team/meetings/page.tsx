import Link from "next/link";
import { ArrowLeft, FileText, Mic } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { DeleteMeetingButton } from "@/components/meetings/delete-meeting-button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { buttonVariants } from "@/components/ui/button";
import { clientBySlug } from "@/lib/roster";
import { listMeetings, type MeetingSummary } from "@/lib/meetings/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Meetings - GV OS" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  agency_call: "Agency call",
  client_call: "Client call",
  manual: "Note",
};

function meetingDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function MeetingRow({ m }: { m: MeetingSummary }) {
  const accent = m.clientSlug ? (clientBySlug(m.clientSlug)?.accent ?? null) : null;
  return (
    <Link
      href={`/team/meetings/${m.id}`}
      className="hover:bg-muted/40 block rounded-lg border p-3.5 transition-colors"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-sm font-medium">{m.title}</span>
        <Badge variant="outline" className="text-[10px]">
          {SOURCE_LABEL[m.source] ?? m.source}
        </Badge>
        {m.clientName && (
          <span
            className="inline-flex items-center gap-1.5 text-[11px]"
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
        <span className="text-faint ml-auto text-xs whitespace-nowrap">
          {meetingDate(m.meetingDate)}
        </span>
        <DeleteMeetingButton id={m.id} mode="row" />
      </div>
      {m.summary && (
        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-sm">{m.summary}</p>
      )}
      <div className="text-faint mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {m.attendees.length > 0 && <span>{m.attendees.join(" · ")}</span>}
        {m.taskCount > 0 && (
          <span className="text-foreground/70">
            {m.taskCount} task{m.taskCount === 1 ? "" : "s"} → Work board
          </span>
        )}
        {m.docLink && (
          <span className="inline-flex items-center gap-1">
            <FileText className="size-3" /> Doc
          </span>
        )}
      </div>
    </Link>
  );
}

export default async function MeetingsPage() {
  const meetings = await listMeetings();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Team"
        highlight="meetings."
        description="Every recorded call. Run /join in a Discord call and the notetaker joins, transcribes it, and drops the recap here; action items flow straight to the Work board."
        actions={
          <Link
            href="/team"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> Team
          </Link>
        }
      />

      {meetings.length === 0 ? (
        <Panel title="No calls yet">
          <div className="text-faint flex flex-col items-center gap-3 py-10 text-center">
            <Mic className="size-6 opacity-50" />
            <p className="max-w-sm text-sm">
              Nothing recorded yet. Run{" "}
              <span className="text-foreground font-medium">/join</span> in any Discord
              call and its recap, transcript, and action items will land here.
            </p>
          </div>
        </Panel>
      ) : (
        <Panel title={`${meetings.length} call${meetings.length === 1 ? "" : "s"}`}>
          <div className="space-y-2">
            {meetings.map((m) => (
              <MeetingRow key={m.id} m={m} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
