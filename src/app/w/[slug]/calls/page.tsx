import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CheckCircle2, Clock, Phone, PhoneCall } from "lucide-react";

import { CallWeekGrid } from "@/components/calls/call-week-grid";
import { CloserSegmentsTable } from "@/components/calls/closer-segments-table";
import { EocFormSheet } from "@/components/calls/eoc-form-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { WindowChips } from "@/components/ui/window-chips";
import { dayKeyCT } from "@/lib/charts";
import {
  inWindow,
  readReportRange,
  reportBounds,
  type ReportRange,
} from "@/lib/tracking/report-window";
import { Kpi } from "@/components/ui/metric";
import { WsPageHeader } from "@/components/workspace/ws-page-header";
import { getDb } from "@/db/client";
import { clients, reps } from "@/db/schema/app";
import { viewerRole } from "@/lib/auth/viewer";
import {
  CALL_STATES,
  groupByDay,
  type CallLogRow,
  type CallState,
} from "@/lib/calls/call-log";
import { loadCallLog } from "@/lib/calls/call-log-loader";
import { callWeek, weekKeyFor } from "@/lib/calls/call-week";
import { segmentByCloser } from "@/lib/calls/closer-segments";
import { outcomeLabelForWords } from "@/lib/calls/eoc-form";
import { isPortalView } from "@/lib/clients/portal-visibility";
import { confirmBooking } from "@/lib/crm/confirmation-actions";
import { rosterClientBySlug } from "@/lib/roster-server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  return { title: client ? `${client.name} Calls - GV OS` : "Calls - GV OS" };
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
});

const whenFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
});

/** The reschedule trail and cancel reason, in words, for a row's second line. */
function trailWords(r: CallLogRow): string[] {
  const words: string[] = [];
  if (r.movedFrom) words.push(`moved from ${whenFmt.format(r.movedFrom)}`);
  if (r.movedTo) words.push(`moved to ${whenFmt.format(r.movedTo)}`);
  if (r.cancelReason) words.push(`“${r.cancelReason}”`);
  return words;
}

function dayLabel(
  key: string,
  todayKey: string,
  tomorrowKey: string,
  yesterdayKey: string,
) {
  if (key === "undated") return "No date";
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  if (key === yesterdayKey) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const OUTCOME_WORD: Record<string, string> = {
  closed: "Closed",
  showed: "Showed",
  no_show: "No-show",
  not_held: "Not held",
};

const OUTCOME_TONE: Record<string, string> = {
  closed: "border-success/40 text-success",
  showed: "border-brand/40 text-brand",
  no_show: "border-warning/40 text-warning",
  not_held: "border-muted-foreground/40 text-muted-foreground",
};

function ConfirmationChip({ row }: { row: CallLogRow }) {
  if (row.confirmation === "in_time") {
    return (
      <span className="text-success inline-flex items-center gap-1 text-[11px]">
        <CheckCircle2 className="size-3" /> Confirmed
      </span>
    );
  }
  if (row.confirmation === "after_start") {
    return <span className="text-faint text-[11px]">Confirmed after it started</span>;
  }
  return <span className="text-faint text-[11px]">Not confirmed</span>;
}

/**
 * Calls — the offer's call log. Every booking from the counted calendar in one
 * place, grouped by day: upcoming calls with the confirm action, calls whose
 * time passed with no outcome (the form one click away), what each reported
 * call's outcome was and where it was recorded, and what got cancelled.
 *
 * GV's ops surface for the floor — never a client portal page.
 */
export default async function WorkspaceCallsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();
  const [cookiePortal, role] = await Promise.all([isPortalView(), viewerRole()]);
  if (cookiePortal || role === "client") notFound();

  const sp = await searchParams;
  const wanted = typeof sp.state === "string" ? sp.state : "all";
  const filter: CallState | "all" = CALL_STATES.some((s) => s.key === wanted)
    ? (wanted as CallState)
    : "all";
  const view: "list" | "week" = sp.view === "week" ? "week" : "list";
  const closersRange = readReportRange(sp.closers);
  const wantedWeek = typeof sp.week === "string" ? sp.week : undefined;
  /** This page's URL with some of its filters changed. */
  const hrefWith = (next: {
    state?: CallState | "all";
    view?: "list" | "week";
    week?: string;
    closers?: ReportRange;
  }) => {
    const q = new URLSearchParams();
    const closers = next.closers ?? closersRange;
    const state = next.state ?? filter;
    const v = next.view ?? view;
    if (state !== "all") q.set("state", state);
    if (v === "week") {
      q.set("view", "week");
      const week = next.week ?? wantedWeek;
      if (week) q.set("week", week);
    }
    if (closers !== "life") q.set("closers", closers);
    const qs = q.toString();
    return qs ? `/w/${slug}/calls?${qs}` : `/w/${slug}/calls`;
  };

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id, countedCallSources: clients.countedCallSources })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);

  const header = (
    <WsPageHeader
      icon={PhoneCall}
      title="Calls"
      lede="Every booked call on this offer — confirm the ones ahead, file what happened on the ones behind, and see where each outcome was recorded."
    />
  );

  if (!row) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Phone}
          title="No client record yet"
          explainer={`${client.name} needs its client record before calls can be logged.`}
        />
      </div>
    );
  }

  const now = new Date();
  const [{ totalBookings, log, counts }, teamReps] = await Promise.all([
    loadCallLog(row.id, row.countedCallSources ?? null, now),
    db
      .select({ id: reps.id, name: reps.name, role: reps.role })
      .from(reps)
      .where(and(eq(reps.clientId, row.id), eq(reps.status, "active"))),
  ]);
  const visible = filter === "all" ? log : log.filter((r) => r.state === filter);
  const days = groupByDay(visible);

  const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayKey = dayKeyFmt.format(now);
  const tomorrowKey = dayKeyFmt.format(new Date(now.getTime() + 86_400_000));
  const yesterdayKey = dayKeyFmt.format(new Date(now.getTime() - 86_400_000));

  if (totalBookings === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Phone}
          title="No calls on the calendar yet"
          explainer={`Calls appear here once ${client.name}'s calendar (Calendly or iClosed) is connected under Integrations and its bookings sync.`}
        />
      </div>
    );
  }

  const tabs: { key: CallState | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: log.length },
    ...CALL_STATES.map((s) => ({ key: s.key, label: s.label, count: counts[s.key] })),
  ];

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          variant="tile"
          label="Upcoming"
          value={String(counts.upcoming)}
          tone="brand"
        />
        <Kpi
          variant="tile"
          label="Needs an outcome"
          value={String(counts.needs_outcome)}
        />
        <Kpi variant="tile" label="Reported" value={String(counts.reported)} />
        <Kpi variant="tile" label="Cancelled" value={String(counts.cancelled)} />
      </div>

      <CloserSegmentsTable
        segments={segmentByCloser(
          log.filter((r) =>
            inWindow(r.startsAt, reportBounds(closersRange, dayKeyCT(now))),
          ),
        )}
        windowChips={
          <WindowChips
            label="By closer window"
            active={closersRange}
            hrefFor={(r) => hrefWith({ closers: r })}
          />
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter calls">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={hrefWith({ state: t.key })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === t.key
                  ? "border-brand/50 bg-brand-soft/30 text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              {t.label} <span className="text-faint tabular-nums">{t.count}</span>
            </Link>
          ))}
        </nav>
        <nav className="flex rounded-md border p-0.5" aria-label="Calls view">
          {(["list", "week"] as const).map((v) => (
            <Link
              key={v}
              href={hrefWith({ view: v })}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "rounded px-2.5 py-1 text-xs transition-colors",
                view === v
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "list" ? "List" : "Week"}
            </Link>
          ))}
        </nav>
      </div>

      {view === "week" ? (
        <CallWeekGrid
          week={callWeek(visible, weekKeyFor(wantedWeek, todayKey), todayKey)}
          slug={slug}
          hrefFor={(week) => hrefWith({ week })}
        />
      ) : days.length === 0 ? (
        <p className="text-faint py-8 text-center text-sm">No calls in this view.</p>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.key}>
              <h2 className="text-faint mb-2 text-[11px] font-medium tracking-wider uppercase">
                {dayLabel(day.key, todayKey, tomorrowKey, yesterdayKey)}
              </h2>
              <ul className="bg-card divide-y rounded-xl border">
                {day.rows.map((r) => (
                  <li
                    key={r.bookingId}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <span className="text-muted-foreground flex w-20 shrink-0 items-center gap-1.5 text-xs tabular-nums">
                      <Clock className="size-3.5" />
                      {r.startsAt ? timeFmt.format(r.startsAt) : "—"}
                    </span>
                    <span className="min-w-0 flex-1">
                      {r.inviteeEmail ? (
                        <Link
                          href={`/w/${slug}/leads/${encodeURIComponent(r.inviteeEmail)}`}
                          className="hover:text-brand block truncate text-sm font-medium"
                        >
                          {r.inviteeName ?? r.inviteeEmail}
                        </Link>
                      ) : (
                        <span className="block truncate text-sm font-medium">
                          {r.inviteeName ?? "Unknown invitee"}
                        </span>
                      )}
                      <span className="text-faint block truncate text-[11px]">
                        {[r.eventType, r.provider, ...trailWords(r)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <ConfirmationChip row={r} />
                    <span className="flex min-w-[9rem] justify-end">
                      {r.state === "cancelled" ? (
                        <span className="text-faint rounded-full border px-2 py-0.5 text-[11px]">
                          {r.rescheduled ? "Rescheduled" : "Cancelled"}
                        </span>
                      ) : r.outcome ? (
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[11px]",
                              OUTCOME_TONE[r.outcome],
                            )}
                            title={r.outcomeWords ?? undefined}
                          >
                            {r.reportSource === "app" && r.outcomeWords
                              ? outcomeLabelForWords(r.outcomeWords)
                              : OUTCOME_WORD[r.outcome]}
                          </span>
                          <span className="text-faint text-[10px]">
                            {r.reportSource === "app" ? "GV OS" : "sheet"}
                          </span>
                        </span>
                      ) : r.state === "needs_outcome" && r.inviteeEmail ? (
                        <EocFormSheet
                          slug={slug}
                          bookingId={r.bookingId}
                          leadEmail={r.inviteeEmail}
                          leadName={r.inviteeName}
                          callLabel={r.startsAt ? timeFmt.format(r.startsAt) : null}
                          reps={teamReps}
                          trigger={{ label: "File outcome", variant: "primary" }}
                        />
                      ) : r.state === "upcoming" && r.confirmation !== "in_time" ? (
                        <form
                          action={confirmBooking}
                          className="flex items-center gap-1.5"
                        >
                          <input type="hidden" name="bookingId" value={r.bookingId} />
                          <input type="hidden" name="slug" value={slug} />
                          <select
                            name="role"
                            defaultValue="setter"
                            aria-label="Who confirmed"
                            className="bg-secondary/60 rounded-md border px-1.5 py-1 text-[11px]"
                          >
                            <option value="setter">Setter</option>
                            <option value="dialer">Dialer</option>
                            <option value="dm_setter">DM setter</option>
                          </select>
                          <button
                            type="submit"
                            className="hover:bg-secondary/70 press rounded-md border px-2.5 py-1 text-xs font-medium"
                          >
                            Confirm
                          </button>
                        </form>
                      ) : r.state === "needs_outcome" ? (
                        <span className="text-warning text-[11px]">
                          No email to file against
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-faint text-xs">
        From this offer&apos;s counted calendar sources. A call needs an outcome an hour
        after its start with no end-of-call report; a report filed in GV OS for the
        booking wins over a matching sheet row. Confirmations count only when recorded
        before the call starts.
      </p>
    </div>
  );
}
