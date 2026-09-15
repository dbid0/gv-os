import Link from "next/link";
import { WsPageHeader } from "@/components/workspace/ws-page-header";
import { AlertTriangle, Kanban, PhoneOff } from "lucide-react";
import { notFound } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";

import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { stuckCalls } from "@/lib/bookings/stuck";
import { filterCountedBookings } from "@/lib/bookings/counted";
import { bookingNotExcluded } from "@/lib/bookings/exclusions-store";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/db/client";
import {
  applications,
  bookings,
  clients,
  clientTrackingRows,
  crmActivity,
  integrations,
  reps as repsTable,
} from "@/db/schema/app";
import { EocPanel } from "@/components/calls/eoc-panel";
import { activeEocReports, listEocReports } from "@/lib/calls/eoc-store";
import { computeSpeedToLead } from "@/lib/funnel/speed-to-lead";
import { DISCONNECTED_LIVE_STL, liveSpeedToLead } from "@/lib/crm/speed-to-lead-live";
import { ActivityTable } from "@/components/tracking/activity-table";
import {
  aggregateActivity,
  floorTotals,
  nearDuplicateRepNames,
} from "@/lib/tracking/activity";
import { currentSnapshot, eodRowsForClient } from "@/lib/tracking/queries";
import { rosterClientBySlug } from "@/lib/roster-server";
import { possessive } from "@/lib/text";
import { refreshProviderOnView } from "@/lib/integrations/refresh-on-view";
import { UpcomingCalls } from "@/components/tracking/upcoming-calls";
import { isPortalView } from "@/lib/clients/portal-visibility";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

/**
 * Workspace CRM — this offer's Close tracking.
 *
 * Daniel: "CRM should be full Close tracking… speed to lead, leads that are
 * responding." So this answers the two questions a floor is actually run on:
 * how fast a new application gets dialled, and whether the leads answer.
 *
 * Speed-to-lead is the tested `computeSpeedToLead`, matching applications to
 * the first Close call on the same email — the SAME function the daily brief
 * uses, so the two can never disagree. When Close is not connected the page
 * says so plainly instead of drawing an empty chart that looks like zero
 * activity: no key, no invented numbers.
 */
export default async function WorkspaceCrmPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Live when you're looking: kick a close pull after the response.
  refreshProviderOnView("close");
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  const clientId = row?.id ?? null;
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const portalView = await isPortalView();

  const [connection, activity, apps] = await Promise.all([
    clientId
      ? db
          .select({
            id: integrations.id,
            status: integrations.status,
            lastSyncAt: integrations.lastSyncAt,
          })
          .from(integrations)
          .where(
            and(
              eq(integrations.provider, "close"),
              eq(integrations.clientId, clientId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    clientId
      ? db
          .select({
            kind: crmActivity.kind,
            leadEmail: crmActivity.leadEmail,
            direction: crmActivity.direction,
            userName: crmActivity.userName,
            occurredAt: crmActivity.occurredAt,
            durationSeconds: crmActivity.durationSeconds,
            leadId: crmActivity.leadId,
          })
          .from(crmActivity)
          .where(
            and(eq(crmActivity.clientId, clientId), gte(crmActivity.occurredAt, since)),
          )
          .orderBy(desc(crmActivity.occurredAt))
          .limit(500)
      : Promise.resolve([]),
    clientId
      ? db
          .select({
            email: applications.email,
            submittedAt: applications.submittedAt,
            createdAt: applications.createdAt,
          })
          .from(applications)
          .where(
            and(
              eq(applications.clientId, clientId),
              gte(applications.createdAt, since),
            ),
          )
          .limit(500)
      : Promise.resolve([]),
  ]);

  const connected = connection[0]?.status === "connected";
  const syncedAgoMin = connection[0]?.lastSyncAt
    ? Math.max(
        0,
        Math.round((now.getTime() - connection[0].lastSyncAt.getTime()) / 60_000),
      )
    : null;
  const accent = (await rosterClientBySlug(slug))?.accent;

  // The floor's own numbers, from the EOD forms already on the tracking sheet.
  // These exist whether or not Close is connected, and they are SELF-REPORTED —
  // a rep's count of their dials and a dialler's count of them are different
  // measurements, so they are labelled as such and never blended.
  const snapshot = clientId ? await currentSnapshot(clientId) : null;
  const eodRows = snapshot ? await eodRowsForClient(snapshot.syncId) : [];
  const reps = aggregateActivity(eodRows);
  const totals = floorTotals(reps);
  const dupes = nearDuplicateRepNames(
    eodRows.map((r) => r.rep ?? "").filter((n) => n !== ""),
  );
  const reportedDays = new Set(
    eodRows.map((r) => r.occurredAt?.toISOString().slice(0, 10)).filter(Boolean),
  ).size;

  // Stuck calls: booked, date passed, nobody said what happened. Bookings
  // are the scheduler's own record; the end-of-call reports on the sheet
  // are the outcomes. Honest empty until a calendar connects.
  let stuck: ReturnType<typeof stuckCalls> = [];
  if (clientId) {
    const [bookingRows, eocRows] = await Promise.all([
      db
        .select({
          id: bookings.id,
          provider: bookings.provider,
          inviteeName: bookings.inviteeName,
          inviteeEmail: bookings.inviteeEmail,
          startsAt: bookings.startsAt,
          status: bookings.status,
        })
        .from(bookings)
        .where(and(eq(bookings.clientId, clientId), bookingNotExcluded))
        .limit(500),
      snapshot
        ? db
            .select({ email: clientTrackingRows.email })
            .from(clientTrackingRows)
            .where(
              and(
                eq(clientTrackingRows.syncId, snapshot.syncId),
                eq(clientTrackingRows.tab, "eoc"),
              ),
            )
        : Promise.resolve([] as { email: string | null }[]),
    ]);
    // Outcomes filed in GV OS clear a stuck call exactly like a sheet row.
    const appReports = await activeEocReports(clientId);
    const reported = new Set(
      [...eocRows, ...appReports]
        .map((r) => r.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    );
    const [countedRow] = await db
      .select({ countedCallSources: clients.countedCallSources })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    stuck = stuckCalls(
      filterCountedBookings(bookingRows, countedRow?.countedCallSources ?? null),
      reported,
      now,
    );
  }

  // The end-of-call desk — GV ops, never the client portal.
  const eocPanel =
    clientId && !portalView
      ? await (async () => {
          const [filed, binned, teamReps] = await Promise.all([
            listEocReports(clientId, { voided: false, limit: 10 }),
            listEocReports(clientId, { voided: true, limit: 10 }),
            db
              .select({ id: repsTable.id, name: repsTable.name, role: repsTable.role })
              .from(repsTable)
              .where(
                and(eq(repsTable.clientId, clientId), eq(repsTable.status, "active")),
              ),
          ]);
          return (
            <EocPanel
              slug={slug}
              stuck={stuck}
              reports={filed}
              voided={binned}
              reps={teamReps}
            />
          );
        })()
      : null;

  const floorPanel =
    reps.length > 0 ? (
      <Panel
        title="The floor — from the EOD forms"
        aside={
          <span className="text-faint text-xs">
            {reps.length} rep{reps.length === 1 ? "" : "s"} · {reportedDays} day
            {reportedDays === 1 ? "" : "s"} reported
          </span>
        }
      >
        <ActivityTable reps={reps} totals={totals} />
        {/* Not merged, reported. A single character also separates two real
            people, and crediting one rep with another's dials is worse than
            showing two rows — the sheet is the only place to fix it properly. */}
        {dupes.length > 0 && (
          <p className="text-warning mt-3 text-xs">
            {dupes.map(([a, b]) => `“${a}” and “${b}”`).join("; ")} look like the same
            person typed two ways, so their numbers are split across rows. Fixing the
            spelling on the sheet merges them.
          </p>
        )}
        <p className="text-faint mt-3 text-xs">
          Self-reported by each rep on their end-of-day form, not pulled from a dialler.
          A dash means the form does not ask for that number, which is not the same as a
          zero. When Close is connected its own counts appear above, beside these rather
          than replacing them.
        </p>
      </Panel>
    ) : null;

  const calls = activity.filter((a) => a.kind === "call");
  const sms = activity.filter((a) => a.kind === "sms");
  const emails = activity.filter((a) => a.kind === "email");
  // A lead "responded" when anything inbound came back from them.
  const inbound = activity.filter((a) => a.direction === "inbound");
  const outboundLeads = new Set(
    activity.filter((a) => a.direction !== "inbound" && a.leadId).map((a) => a.leadId),
  );
  const respondedLeads = new Set(inbound.filter((a) => a.leadId).map((a) => a.leadId));
  const responsePct =
    outboundLeads.size === 0
      ? null
      : Math.round((respondedLeads.size / outboundLeads.size) * 100);

  // Speed to lead — the SAME tested computation the daily brief uses.
  const stl = computeSpeedToLead(
    apps.map((a) => ({
      email: a.email,
      submittedAtMs: (a.submittedAt ?? a.createdAt).getTime(),
    })),
    calls
      .filter((c) => c.occurredAt)
      // The resolved lead email — the join key. Passing null here made
      // speed-to-lead permanently unmeasurable.
      .map((c) => ({ email: c.leadEmail, occurredAtMs: c.occurredAt!.getTime() })),
  );

  // Speed to lead, LIVE — which specific application is late RIGHT NOW.
  // Only meaningful with Typeform AND Close both connected (checked inside);
  // otherwise every number here reads "—", never a fabricated zero.
  const stlLive = clientId ? await liveSpeedToLead(clientId) : DISCONNECTED_LIVE_STL;

  if (!connected) {
    return (
      <div className="space-y-6">
        <WsPageHeader
          icon={Kanban}
          title="CRM"
          lede="The floor's day — what each rep self-reported beside what the CRM recorded, the pre-call confirm queue, and booked calls whose date passed with no outcome filed."
        />
        {/* The floor first: it has real numbers today. The missing CRM is
            stated underneath rather than being the whole page. */}
        {floorPanel}
        {eocPanel}
        <EmptyState
          icon={PhoneOff}
          title="Close CRM isn't connected yet"
          explainer={
            <>
              Once {possessive(client.name)} API key is added in Integrations, this page
              fills in on the next sync — rep dials, texts and emails, how fast new
              applications get called, and which leads answered. Nothing is estimated in
              the meantime: an unconnected CRM shows nothing rather than zeros that read
              like a quiet day.
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {syncedAgoMin !== null && (
        <p className="text-faint -mb-3 text-[11px]">
          <span className="bg-success mr-1.5 inline-block size-1.5 animate-pulse rounded-full align-middle" />
          Live from the dialler — synced{" "}
          {syncedAgoMin === 0 ? "just now" : `${syncedAgoMin}m ago`}; viewing this page
          refreshes it.
        </p>
      )}

      {/* The pre-call queue with the confirm action — GV ops surface, never
          the client portal. */}
      {clientId && !portalView && (
        <UpcomingCalls clientId={clientId} slug={slug} now={now} />
      )}

      {eocPanel ??
        (stuck.length > 0 && (
          <p className="text-warning text-xs">
            {stuck.length} booked call{stuck.length === 1 ? "" : "s"} passed with no
            outcome filed.
          </p>
        ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Speed to lead — median"
          value={stl.medianMinutes === null ? "—" : `${stl.medianMinutes}m`}
          hint="application → first dial"
          accent={accent}
          tone="brand"
        />
        <StatCard
          label="Dialled within 5 min"
          value={stl.slaPct === null ? "—" : `${Math.round(stl.slaPct * 100)}%`}
          hint="the 5-minute standard"
          accent={accent}
          tone={stl.slaPct !== null && stl.slaPct >= 0.8 ? "success" : "warning"}
        />
        <StatCard
          label="Waiting past 5 min now"
          value={stlLive.connected ? String(stlLive.summary.overdueNow) : "—"}
          hint={
            stlLive.connected
              ? "live breaches — no outbound touch yet"
              : "needs Typeform + Close connected"
          }
          accent={accent}
          tone={
            stlLive.connected && stlLive.summary.overdueNow > 0 ? "warning" : "default"
          }
        />
        <StatCard
          label="Leads responded"
          value={responsePct === null ? "—" : `${responsePct}%`}
          hint="anything inbound came back"
          accent={accent}
        />
        <StatCard
          label={`Activity · ${WINDOW_DAYS}d`}
          value={String(activity.length)}
          hint="calls, texts and emails"
          accent={accent}
        />
      </div>

      {floorPanel}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Close activity — last ${WINDOW_DAYS} days`}>
          <div className="divide-y">
            {[
              { label: "Calls", n: calls.length },
              { label: "Texts", n: sms.length },
              { label: "Emails", n: emails.length },
              { label: "Inbound (they replied)", n: inbound.length },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2.5">
                <span className="text-sm">{r.label}</span>
                <span className="text-sm font-semibold tabular-nums">{r.n}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Speed to lead">
          {stl.matched === 0 ? (
            <p className="text-faint py-8 text-center text-sm">
              No application has been matched to a first dial yet in this window.
            </p>
          ) : (
            <div className="divide-y">
              {[
                { label: "Applications with an email", n: stl.dialableApps },
                { label: "Matched to a first dial", n: stl.matched },
                { label: "Dialled within 5 minutes", n: stl.within5 },
                { label: "Dialled within 20 minutes", n: stl.within20 },
                { label: "Took over an hour", n: stl.over60 },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-2.5">
                  <span className="text-sm">{r.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{r.n}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Which SPECIFIC application is late right now, not just the window's
          average — the operational cut, so GV ops only (same precedent as
          UpcomingCalls above: an action list, never the client portal). */}
      {!portalView && !stlLive.connected && (
        <Panel title="Speed to lead — live">
          <p className="text-faint py-6 text-center text-sm">
            Connect Typeform and Close to see which applications are waiting on first
            contact right now.
          </p>
        </Panel>
      )}
      {!portalView && stlLive.connected && (
        <Panel
          title="Speed to lead — live"
          aside={
            <span className="text-faint text-xs">
              calls, texts and emails · outbound only
            </span>
          }
        >
          {stlLive.liveBreaches.length === 0 && stlLive.recentBreaches.length === 0 ? (
            <p className="text-faint py-6 text-center text-sm">
              Nothing waiting past the 5-minute standard right now.
            </p>
          ) : (
            <div className="space-y-5">
              {stlLive.liveBreaches.length > 0 && (
                <div>
                  <p className="text-warning mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
                    <AlertTriangle className="size-3.5" />
                    Waiting on first contact ({stlLive.liveBreaches.length})
                  </p>
                  <div className="divide-y">
                    {stlLive.liveBreaches.map((b) => (
                      <div
                        key={b.email}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <Link
                          href={`/w/${slug}/leads/${encodeURIComponent(b.email)}`}
                          className="hover:text-brand min-w-0 truncate text-sm font-medium"
                        >
                          {b.name?.trim() || b.email}
                        </Link>
                        <span className="text-warning shrink-0 text-xs font-semibold tabular-nums">
                          {Math.round(b.waitingSec / 60)}m overdue
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {stlLive.recentBreaches.length > 0 && (
                <div>
                  <p className="text-faint mb-2 text-[11px] font-medium tracking-wider uppercase">
                    Recently missed the 5-minute window
                  </p>
                  <div className="divide-y">
                    {stlLive.recentBreaches.map((b) => (
                      <div
                        key={b.email}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <Link
                          href={`/w/${slug}/leads/${encodeURIComponent(b.email)}`}
                          className="hover:text-brand min-w-0 truncate text-sm font-medium"
                        >
                          {b.name?.trim() || b.email}
                        </Link>
                        <span className="text-faint shrink-0 text-xs tabular-nums">
                          {Math.round(b.timeToContactSec / 60)}m to first contact ·{" "}
                          {new Date(b.submittedAtMs).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            timeZone: "America/Chicago",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      <Panel title="Recent activity">
        {activity.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            Nothing logged in Close in the last {WINDOW_DAYS} days.
          </p>
        ) : (
          <div className="divide-y">
            {activity.slice(0, 12).map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <span className="text-faint w-14 shrink-0 text-xs capitalize">
                  {a.kind}
                </span>
                {/* WHO the touch reached leads the row — the dial's whole
                    point — linked to their story when the CRM knew an email. */}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.leadEmail ? (
                    <Link
                      href={`/w/${slug}/leads/${encodeURIComponent(a.leadEmail)}`}
                      className="hover:text-brand font-medium"
                    >
                      {a.leadEmail}
                    </Link>
                  ) : (
                    <span className="text-faint">no lead on record</span>
                  )}
                  <span className="text-faint text-xs">
                    {" "}
                    · {a.userName ?? "—"}
                    {a.direction && ` · ${a.direction}`}
                  </span>
                </span>
                <span className="text-faint w-32 shrink-0 text-right text-xs tabular-nums">
                  {a.occurredAt
                    ? a.occurredAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "America/Chicago",
                      })
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
