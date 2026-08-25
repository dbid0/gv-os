import { FileSignature, Gauge, Inbox } from "lucide-react";

import { Kpi } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { ColumnChart } from "@/components/ui/column-chart";
import { bucketByDay } from "@/lib/charts";
import { funnelSummary, listApplications, listSignedDocs } from "@/lib/funnel/queries";
import { listCallLogs } from "@/lib/sales/call-queries";
import { computeSpeedToLead } from "@/lib/funnel/speed-to-lead";

export const metadata = { title: "Applications - GV OS" };
export const dynamic = "force-dynamic";

const fmtWhen = (d: Date | null) =>
  d
    ? d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Chicago",
      })
    : "—";

export default async function ApplicationsPage() {
  const [summary, apps, docs, calls] = await Promise.all([
    funnelSummary(),
    listApplications(),
    listSignedDocs(),
    listCallLogs(),
  ]);
  const perDay = bucketByDay(
    apps.map((a) => a.submittedAt ?? a.createdAt),
    30,
    new Date(),
  );

  // Speed to lead — real minutes from each application to its first logged dial,
  // matched by email. The 5-minute standard is GV's non-negotiable; until calls
  // are logged against these leads (Close/booking feed), nothing is invented.
  const stl = computeSpeedToLead(
    apps.map((a) => ({
      email: a.email,
      submittedAtMs: (a.submittedAt ?? a.createdAt).getTime(),
    })),
    calls.map((c) => ({
      email: c.customerEmail,
      occurredAtMs: c.occurredAt.getTime(),
    })),
  );
  const slaTone =
    stl.slaPct === null ? "default" : stl.slaPct >= 0.8 ? "success" : "warning";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Applications · 30d" value={String(summary.apps30d)} tone="brand" />
        <Kpi label="Applications · 7d" value={String(summary.apps7d)} />
        <Kpi
          label="Applications · 24h"
          value={String(summary.apps24h)}
          tone={summary.apps24h > 0 ? "success" : "default"}
        />
        <Kpi label="Signed agreements" value={String(summary.signedTotal)} />
      </div>

      {summary.byClient.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.byClient.map((c) => (
            <span
              key={c.clientName}
              className="text-muted-foreground rounded-full border px-2.5 py-1 text-xs"
            >
              {c.clientName} · {c.apps} {c.apps === 1 ? "app" : "apps"}
            </span>
          ))}
        </div>
      )}

      <Panel
        title="Speed to lead"
        aside={
          stl.matched > 0 ? (
            <StatusPill tone={slaTone === "success" ? "live" : "pending"}>
              {stl.matched} measured
            </StatusPill>
          ) : (
            <StatusPill tone="pending">Waiting on call data</StatusPill>
          )
        }
      >
        {stl.matched === 0 ? (
          <p className="text-faint py-6 text-center text-sm">
            <Gauge className="mr-1 inline size-4" />
            Time-to-first-dial lands here once calls are logged against these leads —
            connect an offer&apos;s Close feed or log dials on the Call Log, and each
            application is measured against GV&apos;s 5-minute standard. Nothing is
            estimated until then.
          </p>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Median time to dial"
                value={stl.medianMinutes === null ? "—" : `${stl.medianMinutes} min`}
                icon={Gauge}
                tone="brand"
              />
              <Kpi
                label="Within 5 min (standard)"
                value={stl.slaPct === null ? "—" : `${Math.round(stl.slaPct * 100)}%`}
                tone={slaTone}
              />
              <Kpi
                label="Leads measured"
                value={`${stl.matched}/${stl.dialableApps}`}
              />
              <Kpi
                label="Dialed after 60 min"
                value={String(stl.over60)}
                tone={stl.over60 > 0 ? "danger" : "default"}
              />
            </div>
            <p className="text-faint mt-4 border-t pt-3 text-xs">
              Measured by matching each application&apos;s email to its first logged
              call. {stl.within20} of {stl.matched} were dialed within 20 minutes.
              Application-quality scoring is a later add — it needs each form&apos;s
              answers plus a rubric.
            </p>
          </>
        )}
      </Panel>

      <Panel title="Applications per day — last 30">
        <ColumnChart data={perDay} />
      </Panel>

      <Panel title="Applications in">
        {apps.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            <Inbox className="mr-1 inline size-4" />
            Nothing captured yet — connect a client&apos;s Typeform under Settings →
            Integrations and applications land here on the next pull.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Client</th>
                  <th className="py-2 pr-3 font-medium">Form</th>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                      {fmtWhen(a.submittedAt ?? a.createdAt)}
                    </td>
                    <td className="py-2 pr-3">{a.clientName ?? "Agency"}</td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {a.formName ?? "—"}
                    </td>
                    <td className="py-2 pr-3">{a.name ?? "—"}</td>
                    <td className="text-muted-foreground py-2">{a.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Signed agreements">
        {docs.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            <FileSignature className="mr-1 inline size-4" />
            No signed agreements captured yet — connect a client&apos;s PandaDoc key and
            completed documents appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.id}
                className="bg-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3"
              >
                <FileSignature className="text-success size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {d.name ?? "Agreement"}
                  </p>
                  <p className="text-faint text-[11px]">
                    {d.recipientEmail ?? "recipient unknown"}
                  </p>
                </div>
                <span className="text-muted-foreground rounded-full border px-1.5 text-[11px]">
                  {d.clientName ?? "Agency"}
                </span>
                <StatusPill tone="live">Signed</StatusPill>
                <span className="text-faint text-xs whitespace-nowrap">
                  {fmtWhen(d.completedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
