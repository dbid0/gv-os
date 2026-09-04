import { notFound } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";

import { Panel } from "@/components/ui/panel";
import { Kpi } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { applications, clients, crmActivity, integrations } from "@/db/schema/app";
import { computeSpeedToLead } from "@/lib/funnel/speed-to-lead";
import { ActivityTable } from "@/components/tracking/activity-table";
import {
  aggregateActivity,
  floorTotals,
  nearDuplicateRepNames,
} from "@/lib/tracking/activity";
import { currentSnapshot, eodRowsForClient } from "@/lib/tracking/queries";
import { clientBySlug } from "@/lib/roster";
import { possessive } from "@/lib/text";

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
  const { slug } = await params;
  const client = clientBySlug(slug);
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

  const [connection, activity, apps] = await Promise.all([
    clientId
      ? db
          .select({ id: integrations.id, status: integrations.status })
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
      .map((c) => ({ email: null, occurredAtMs: c.occurredAt!.getTime() })),
  );

  if (!connected) {
    return (
      <div className="space-y-6">
        {/* The floor first: it has real numbers today. The missing CRM is
            stated underneath rather than being the whole page. */}
        {floorPanel}
        <Panel
          title="Close CRM"
          aside={<StatusPill tone="pending">Not connected</StatusPill>}
        >
          <p className="text-muted-foreground text-sm">
            {possessive(client.name)} Close account isn&apos;t connected yet. Once its
            API key is added in Integrations, this page fills in on the next sync: rep
            dials, texts and emails, how fast new applications get called, and which
            leads answered.
          </p>
          <p className="text-faint mt-2 text-xs">
            Nothing is estimated here — an unconnected CRM shows nothing rather than
            zeros that read like a quiet day.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Speed to lead — median"
          value={stl.medianMinutes === null ? "—" : `${stl.medianMinutes}m`}
          tone="brand"
        />
        <Kpi
          label="Dialled within 5 min"
          value={stl.slaPct === null ? "—" : `${Math.round(stl.slaPct * 100)}%`}
          tone={stl.slaPct !== null && stl.slaPct >= 0.8 ? "success" : "warning"}
        />
        <Kpi
          label="Leads responded"
          value={responsePct === null ? "—" : `${responsePct}%`}
        />
        <Kpi label={`Activity · ${WINDOW_DAYS}d`} value={String(activity.length)} />
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

      <Panel title="Recent activity">
        {activity.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            Nothing logged in Close in the last {WINDOW_DAYS} days.
          </p>
        ) : (
          <div className="divide-y">
            {activity.slice(0, 12).map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <span className="text-faint w-14 text-xs capitalize">{a.kind}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.userName ?? "—"}
                  {a.direction && (
                    <span className="text-faint text-xs"> · {a.direction}</span>
                  )}
                </span>
                <span className="text-faint w-24 text-right text-xs tabular-nums">
                  {a.occurredAt
                    ? a.occurredAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
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
