import { ClipboardCheck, ExternalLink, TriangleAlert } from "lucide-react";

import { EocFormSheet, type EocRepOption } from "@/components/calls/eoc-form-sheet";
import { EocReportAction } from "@/components/calls/eoc-report-actions";
import type { StuckCall } from "@/lib/bookings/stuck";
import { closeTypeLabel, outcomeLabel } from "@/lib/calls/eoc-form";
import type { EocListRow } from "@/lib/calls/eoc-store";
import { cents, formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";
import { viewerTimeZone } from "@/lib/time/viewer-zone";

const whenIn = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

const OUTCOME_TONE: Record<string, string> = {
  closed: "border-success/40 text-success",
  follow_up: "border-brand/40 text-brand",
  not_a_fit: "border-muted-foreground/40 text-muted-foreground",
  no_show: "border-warning/40 text-warning",
  rescheduled: "border-muted-foreground/40 text-muted-foreground",
  cancelled: "border-muted-foreground/40 text-muted-foreground",
};

function ReportRow({
  slug,
  row,
  mode,
  when,
}: {
  slug: string;
  row: EocListRow;
  mode: "void" | "restore";
  when: Intl.DateTimeFormat;
}) {
  const close = closeTypeLabel(row.closeType);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2.5 text-sm">
      <span className="min-w-0 font-medium">{row.leadEmail}</span>
      <span
        className={cn(
          "rounded-full border px-2 py-0.5 text-[11px]",
          OUTCOME_TONE[row.outcome] ?? "border-muted-foreground/40",
        )}
      >
        {outcomeLabel(row.outcome)}
      </span>
      {close && row.contractValueCents !== null && (
        <span className="text-muted-foreground text-xs tabular-nums">
          {close} · {formatUSD(cents(row.contractValueCents))}
          {row.cashCollectedCents !== null &&
            ` · ${formatUSD(cents(row.cashCollectedCents))} on the call`}
        </span>
      )}
      <span className="text-faint text-xs">
        {when.format(row.callAt)}
        {row.closerName ? ` · ${row.closerName}` : ""}
      </span>
      {row.recordingUrl && (
        <a
          href={row.recordingUrl}
          target="_blank"
          rel="noreferrer"
          className="text-brand inline-flex items-center gap-1 text-xs hover:underline"
        >
          Recording <ExternalLink className="size-3" />
        </a>
      )}
      <span className="ml-auto">
        <EocReportAction slug={slug} reportId={row.id} mode={mode} />
      </span>
      {row.notes && (
        <p className="text-muted-foreground w-full text-xs whitespace-pre-line">
          {row.notes}
        </p>
      )}
      {mode === "restore" && row.voidedAt && (
        <p className="text-faint w-full text-[11px]">
          Voided {when.format(row.voidedAt)}
          {row.voidedBy ? ` by ${row.voidedBy}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * The end-of-call desk for one offer: booked calls whose date passed with no
 * outcome (each with the form one click away), a way to log a call that was
 * never booked, the reports filed here, and the restore bin. Outcomes filed
 * here count in the stuck list and the confirmation rates exactly like the
 * sheet's reports. (The lead funnel is still built from the sheet's own tabs.)
 */
export async function EocPanel({
  slug,
  stuck,
  reports,
  voided,
  reps,
}: {
  slug: string;
  stuck: StuckCall[];
  reports: EocListRow[];
  voided: EocListRow[];
  reps: EocRepOption[];
}) {
  const when = whenIn(await viewerTimeZone());
  return (
    <section className="card-grad space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-faint flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
            <ClipboardCheck className="size-3.5" /> End-of-call reports
          </p>
          <p className="text-muted-foreground mt-1 max-w-2xl text-xs">
            File what happened on a call. The outcome counts at once in stuck calls and
            confirmation rates, exactly like a report typed on the tracking sheet.
            Reports never change money.
          </p>
        </div>
        <EocFormSheet
          slug={slug}
          bookingId={null}
          leadEmail={null}
          leadName={null}
          callLabel={null}
          reps={reps}
          trigger={{ label: "Log a call outcome", variant: "quiet" }}
        />
      </div>

      {stuck.length > 0 && (
        <div className="border-warning/40 bg-warning/5 rounded-lg border p-3">
          <p className="text-warning flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
            <TriangleAlert className="size-3.5" /> Stuck — date passed, no outcome filed
            ({stuck.length})
          </p>
          <div className="gv-rows mt-2 space-y-1.5">
            {stuck.slice(0, 8).map((c) => (
              <div
                key={`${c.bookingId ?? c.inviteeEmail}-${c.startsAt.toISOString()}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
              >
                <span className="font-medium">
                  {c.inviteeName ?? c.inviteeEmail ?? "Unknown invitee"}
                </span>
                <span className="text-faint text-xs">
                  {when.format(c.startsAt)} · {c.hoursOverdue}h overdue
                </span>
                {c.bookingId && c.inviteeEmail && (
                  <span className="ml-auto">
                    <EocFormSheet
                      slug={slug}
                      bookingId={c.bookingId}
                      leadEmail={c.inviteeEmail}
                      leadName={c.inviteeName}
                      callLabel={when.format(c.startsAt)}
                      reps={reps}
                      trigger={{ label: "File outcome", variant: "primary" }}
                    />
                  </span>
                )}
              </div>
            ))}
            {stuck.length > 8 && (
              <p className="text-faint text-xs">and {stuck.length - 8} more</p>
            )}
          </div>
          <p className="text-faint mt-2 text-xs">
            Booked, never cancelled, and no end-of-call report for the invitee. Either
            it happened and nobody wrote it down, or it never happened.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-faint text-[11px]">
          Filed in GV OS{reports.length > 0 ? ` · latest ${reports.length}` : ""}
        </p>
        {reports.length === 0 ? (
          <p className="text-faint text-xs">
            Nothing filed here yet. Reports typed on the tracking sheet still count.
          </p>
        ) : (
          reports.map((r) => (
            <ReportRow when={when} key={r.id} slug={slug} row={r} mode="void" />
          ))
        )}
      </div>

      {voided.length > 0 && (
        <details className="group">
          <summary className="text-faint cursor-pointer text-[11px] hover:underline">
            Restore bin ({voided.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {voided.map((r) => (
              <ReportRow when={when} key={r.id} slug={slug} row={r} mode="restore" />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
