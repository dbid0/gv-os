import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { Kpi } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { cents, formatUSD } from "@/lib/money";
import { clientBySlug } from "@/lib/roster";
import { searchLeads } from "@/lib/tracking/leads";
import { currentSnapshot, leadsForClient } from "@/lib/tracking/queries";

export const dynamic = "force-dynamic";

/**
 * Every lead on this offer, stitched from the tracking sheet.
 *
 * The sheet records one person across six tabs — they apply, a call is booked,
 * a closer files an EOC report, a deal is logged, a payment lands, a balance
 * sits in AR. Nobody could answer "what happened with this lead" without
 * reading five tabs. This is that answer, joined on the email, which is the
 * only identifier every tab carries.
 */
export default async function WorkspaceLeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q = "" } = await searchParams;
  const client = clientBySlug(slug);
  if (!client) notFound();

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  if (!row) notFound();

  const snapshot = await currentSnapshot(row.id);
  if (!snapshot) {
    return (
      <Panel title="Leads" aside={<StatusPill tone="pending">No sync yet</StatusPill>}>
        <p className="text-muted-foreground text-sm">
          Leads are stitched from {client.name}&apos;s Master Tracking Sheet. Once
          it&apos;s linked and synced under Tracking, every applicant, booked call and
          end-of-call report shows up here as one journey per person.
        </p>
      </Panel>
    );
  }

  const all = await leadsForClient(snapshot.syncId);
  const leads = searchLeads(all, q);
  const withCalls = all.filter((l) => l.eocReports > 0).length;
  const withRecordings = all.filter((l) => l.recordings > 0).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Leads tracked"
          value={all.length.toLocaleString("en-US")}
          tone="brand"
        />
        <Kpi label="Reached a call" value={String(withCalls)} />
        <Kpi label="With a recording" value={String(withRecordings)} />
        <Kpi
          label="Payments logged"
          value={formatUSD(cents(all.reduce((s, l) => s + l.paymentsCents, 0)))}
        />
      </div>

      <Panel
        title={q ? `Leads matching “${q}”` : "Leads"}
        aside={
          <form className="flex items-center gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="email, name or rep"
              className="bg-card h-8 w-56 rounded-md border px-2.5 text-xs"
            />
          </form>
        }
      >
        {leads.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            {all.length === 0
              ? "No lead rows on this sheet yet."
              : "No lead matches that search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-faint border-b text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4 text-left font-medium">Lead</th>
                  <th className="py-2 pr-4 text-left font-medium">Rep</th>
                  <th className="py-2 pr-4 text-center font-medium">Applied</th>
                  <th className="py-2 pr-4 text-right font-medium">Calls</th>
                  <th className="py-2 pr-4 text-right font-medium">EOCs</th>
                  <th className="py-2 pr-4 text-left font-medium">Latest status</th>
                  <th className="py-2 pr-4 text-right font-medium">Payments</th>
                  <th className="py-2 pr-4 text-right font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 200).map((l) => (
                  <tr
                    key={l.email}
                    className="hover:bg-muted/40 border-b last:border-0"
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/w/${slug}/leads/${encodeURIComponent(l.email)}`}
                        className="hover:text-brand block"
                      >
                        <span className="font-medium">{l.name ?? l.email}</span>
                        {l.name && (
                          <span className="text-faint block text-xs">{l.email}</span>
                        )}
                      </Link>
                    </td>
                    <td className="text-muted-foreground py-2 pr-4">
                      {l.reps[0] ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-center">{l.applied ? "✓" : "—"}</td>
                    <td className="numeric py-2 pr-4 text-right">
                      {l.callsBooked || "—"}
                    </td>
                    <td className="numeric py-2 pr-4 text-right">
                      {l.eocReports || "—"}
                      {l.recordings > 0 && (
                        <span className="text-faint ml-1 text-xs">▶{l.recordings}</span>
                      )}
                    </td>
                    <td className="text-muted-foreground max-w-56 truncate py-2 pr-4">
                      {l.latestStatus ?? "—"}
                    </td>
                    <td className="numeric py-2 pr-4 text-right">
                      {l.paymentsCents > 0 ? formatUSD(cents(l.paymentsCents)) : "—"}
                    </td>
                    <td className="text-faint py-2 pr-4 text-right whitespace-nowrap">
                      {l.lastSeen
                        ? l.lastSeen.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {leads.length > 200 && (
              <p className="text-faint mt-3 text-xs">
                Showing the 200 most recent of {leads.length}. Search to narrow.
              </p>
            )}
          </div>
        )}
        <p className="text-faint mt-3 text-xs">
          Payments come from the sheet&apos;s Payment Log — the processor&apos;s record.
          Deal and EOC rows restate the same sale, so they are not added in. All of it
          is tracking context; the ledger remains the only record of money.
        </p>
      </Panel>
    </div>
  );
}
