import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { SyncTrackingButton } from "@/components/tracking/sync-button";
import { TabScanTable } from "@/components/tracking/tab-scan-table";
import { Kpi } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { clientBySlug } from "@/lib/roster";
import { currentSnapshot, rowsForTab } from "@/lib/tracking/queries";
import { scanWarnings } from "@/lib/tracking/scan";

export const dynamic = "force-dynamic";

/**
 * Workspace Tracking — this offer's Master Tracking Sheet, mirrored.
 *
 * Every GV client runs the same sheet: Applications, Calls Log, Payment Log,
 * New Deals, AR, the BOD/EOD forms, and EOC (end-of-call) reports. This is the
 * deep scan of it — what came through, and what the sheet is missing.
 *
 * The scan matters as much as the data. The Grid's Calls Log holds 109 rows of
 * which 7 carry a date, so a "calls per day" chart drawn from that tab would be
 * reading 6% of it and looking confident. Those gaps are stated here rather
 * than smoothed over, and nothing is estimated: an unlinked sheet says so.
 */
export default async function WorkspaceTrackingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id, sheet: clients.trackingSheetId })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);

  if (!row) {
    return (
      <Panel title="Tracking sheet">
        <p className="text-muted-foreground text-sm">
          {client.name} has no client record in the database yet, so there is nothing to
          sync against.
        </p>
      </Panel>
    );
  }

  if (!row.sheet) {
    return (
      <Panel
        title="Tracking sheet"
        aside={<StatusPill tone="pending">Not linked</StatusPill>}
      >
        <p className="text-muted-foreground text-sm">
          {client.name}&apos;s Master Tracking Sheet isn&apos;t linked yet. Add its
          Sheet ID under Setup and this fills in on the next sync: applications, booked
          calls, EOC reports with their recordings, the BOD/EOD forms, payments and AR.
        </p>
        <p className="text-faint mt-2 text-xs">
          Nothing is estimated here — an unlinked sheet shows nothing rather than zeros
          that read like a quiet month.
        </p>
      </Panel>
    );
  }

  const snapshot = await currentSnapshot(row.id);
  if (!snapshot) {
    return (
      <Panel
        title="Tracking sheet"
        aside={<SyncTrackingButton slug={slug} label="Run the first sync" />}
      >
        <p className="text-muted-foreground text-sm">
          The sheet is linked but has never been pulled. Run a sync and this fills with
          the live rows.
        </p>
      </Panel>
    );
  }

  const warnings = scanWarnings(snapshot.tabs);
  const eoc = snapshot.tabs.find((t) => t.tab === "eoc");
  const applications = snapshot.tabs.find((t) => t.tab === "applications");
  const recent = await rowsForTab(snapshot.syncId, "eoc", 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Rows mirrored"
          value={snapshot.rowCount.toLocaleString("en-US")}
          tone="brand"
        />
        <Kpi
          label="Applications"
          value={applications ? String(applications.rows) : "—"}
        />
        <Kpi label="EOC reports" value={eoc ? String(eoc.rows) : "—"} />
        <Kpi label="With a recording" value={eoc ? String(eoc.withRecording) : "—"} />
      </div>

      {warnings.length > 0 && (
        <Panel title="What this sheet is missing">
          {/* Stated, not smoothed: a metric built on an undated tab is
              reading a fraction of it, and the reader should know which. */}
          <ul className="space-y-1.5 text-sm">
            {warnings.map((w) => (
              <li key={w} className="text-warning">
                {w}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title="Tabs"
        aside={
          <div className="flex items-center gap-3">
            <span className="text-faint text-xs">
              synced{" "}
              {snapshot.syncedAt.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <SyncTrackingButton slug={slug} label="Sync now" />
          </div>
        }
      >
        <TabScanTable tabs={snapshot.tabs} />
      </Panel>

      <Panel
        title="Latest end-of-call reports"
        aside={<span className="text-faint text-xs">newest first</span>}
      >
        {recent.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            No EOC reports on this sheet yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-faint border-b text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4 text-left font-medium">When</th>
                  <th className="py-2 pr-4 text-left font-medium">Closer</th>
                  <th className="py-2 pr-4 text-left font-medium">Lead</th>
                  <th className="py-2 pr-4 text-left font-medium">Outcome</th>
                  <th className="py-2 pr-4 text-left font-medium">Recording</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.rowIndex} className="border-b last:border-0">
                    <td className="text-muted-foreground py-2 pr-4 whitespace-nowrap">
                      {r.occurredAt
                        ? r.occurredAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">{r.rep ?? "—"}</td>
                    <td className="text-muted-foreground py-2 pr-4">
                      {r.email ?? "—"}
                    </td>
                    <td className="py-2 pr-4">{r.status ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {r.recordingUrl && r.recordingUrl.startsWith("http") ? (
                        <a
                          href={r.recordingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand hover:underline"
                        >
                          open
                        </a>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
