import { WsPageHeader } from "@/components/workspace/ws-page-header";
import { Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { displayName } from "@/lib/text";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { LeadViewsBar } from "@/components/tracking/lead-views-bar";
import { StatusChip } from "@/components/tracking/status-chip";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { cents, formatUSD } from "@/lib/money";
import { rosterClientBySlug } from "@/lib/roster-server";
import { viewerRole } from "@/lib/auth/viewer";
import { viewerRepFor } from "@/lib/auth/viewer-rep";
import { isPortalView } from "@/lib/clients/portal-visibility";
import { listLeadTags, listLeadViews } from "@/lib/tracking/lead-tags-store";
import {
  LEAD_HAS,
  NO_FILTERS,
  describeFilters,
  filterLeads,
  isFiltered,
  leadFiltersQuery,
  readLeadFilters,
  repOptions,
  tagUsage,
  tagsByLead,
} from "@/lib/tracking/lead-views";
import { currentSnapshot, leadsForClient } from "@/lib/tracking/queries";
import { appEocLeadRows } from "@/lib/calls/eoc-store";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const [sp, cookiePortal, role] = await Promise.all([
    searchParams,
    isPortalView(),
    viewerRole(),
  ]);
  // Tags and saved views are GV's own ops labels — never on the client's view.
  const opsView = !cookiePortal && role !== "client";
  const requested = readLeadFilters(sp);
  const filters = opsView ? requested : { ...NO_FILTERS, q: requested.q };
  const { q } = filters;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);

  // A roster client with no database row yet is a real state (it appears
  // before the first sync creates one). It used to render a BLANK page —
  // status 200 with nothing on it, which reads as broken rather than as empty.
  if (!row) {
    return (
      <Panel title="Leads" aside={<StatusPill tone="pending">Not set up</StatusPill>}>
        <p className="text-muted-foreground text-sm">
          {client.name} doesn&apos;t have a client record yet, so there is nothing to
          stitch leads from. It appears here once the offer is set up and its tracking
          sheet has synced.
        </p>
      </Panel>
    );
  }

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

  const [appRows, aliases, tagRows, views, myRep] = await Promise.all([
    appEocLeadRows(row.id),
    aliasMapForClient(row.id),
    opsView ? listLeadTags(row.id) : Promise.resolve([]),
    opsView ? listLeadViews(row.id) : Promise.resolve([]),
    opsView ? viewerRepFor(row.id) : Promise.resolve(null),
  ]);
  const all = await leadsForClient(snapshot.syncId, appRows, aliases);
  const tags = tagsByLead(tagRows, aliases);
  const usage = tagUsage(tags);
  const reps = repOptions(all);
  const leads = filterLeads(all, filters, tags);
  const currentQuery = leadFiltersQuery(filters);
  const filtered = isFiltered(filters);
  const chipHref = (tag: string | null) => {
    const qs = leadFiltersQuery({ ...filters, tag });
    return qs ? `/w/${slug}/leads?${qs}` : `/w/${slug}/leads`;
  };
  const withCalls = all.filter((l) => l.eocReports > 0).length;
  const withRecordings = all.filter((l) => l.recordings > 0).length;

  return (
    <div className="space-y-6">
      <WsPageHeader
        icon={Users}
        title="Leads"
        lede="Every person this offer knows — applications, calls, end-of-call reports and payments stitched into one row per human."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Leads tracked"
          value={all.length.toLocaleString("en-US")}
          hint="every person on the sheet"
          accent={client.accent}
          tone="brand"
        />
        <StatCard
          label="Reached a call"
          value={String(withCalls)}
          hint="had at least one end-of-call report"
          accent={client.accent}
        />
        <StatCard
          label="With a recording"
          value={String(withRecordings)}
          hint="a call you can replay"
          accent={client.accent}
        />
        <StatCard
          label="Payments logged"
          value={formatUSD(cents(all.reduce((s, l) => s + l.paymentsCents, 0)))}
          hint="from the sheet's payment log"
          accent={client.accent}
          tone="success"
        />
      </div>

      <Panel
        title={
          filtered
            ? `${describeFilters(filters)} · ${leads.length.toLocaleString("en-US")}`
            : "Leads"
        }
        aside={
          !opsView ? (
            <form className="flex items-center gap-2">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="email, name or rep"
                className="bg-card h-8 w-56 rounded-md border px-2.5 text-xs"
              />
            </form>
          ) : undefined
        }
      >
        {opsView && (
          <div className="mb-4 space-y-3">
            <form
              className="flex flex-wrap items-center gap-2"
              aria-label="Filter leads"
            >
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="email, name or rep"
                aria-label="Search leads"
                className="bg-card h-8 w-52 rounded-md border px-2.5 text-xs"
              />
              <select
                name="has"
                defaultValue={filters.has ?? ""}
                aria-label="Where the lead got to"
                className="bg-card h-8 rounded-md border px-2 text-xs"
              >
                <option value="">Any stage</option>
                {LEAD_HAS.map((h) => (
                  <option key={h.key} value={h.key}>
                    {h.label}
                  </option>
                ))}
              </select>
              {reps.length > 0 && (
                <select
                  name="rep"
                  defaultValue={filters.rep ?? ""}
                  aria-label="Rep"
                  className="bg-card h-8 rounded-md border px-2 text-xs"
                >
                  <option value="">Any rep</option>
                  {reps.map((r) => (
                    <option key={r} value={r}>
                      {displayName(r)}
                    </option>
                  ))}
                </select>
              )}
              {filters.tag && <input type="hidden" name="tag" value={filters.tag} />}
              <button
                type="submit"
                className="hover:bg-secondary/70 h-8 rounded-md border px-3 text-xs font-medium"
              >
                Filter
              </button>
              {myRep && (
                <Link
                  href={`/w/${slug}/leads?${leadFiltersQuery({ ...NO_FILTERS, rep: myRep.name })}`}
                  aria-current={
                    filters.rep?.toLowerCase() === myRep.name.toLowerCase()
                      ? "true"
                      : undefined
                  }
                  className="text-brand text-xs hover:underline"
                >
                  My leads
                </Link>
              )}
              {filtered && (
                <Link
                  href={`/w/${slug}/leads`}
                  className="text-faint hover:text-foreground text-xs"
                >
                  Clear
                </Link>
              )}
            </form>
            {usage.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-faint mr-1 text-[11px] font-medium tracking-wider uppercase">
                  Tags
                </span>
                {usage.map((u) => (
                  <Link
                    key={u.tag}
                    href={chipHref(filters.tag === u.tag ? null : u.tag)}
                    aria-current={filters.tag === u.tag ? "true" : undefined}
                    className={
                      filters.tag === u.tag
                        ? "border-brand/50 bg-brand-soft/30 rounded-full border px-2.5 py-0.5 text-xs"
                        : "text-muted-foreground hover:bg-secondary/60 rounded-full border px-2.5 py-0.5 text-xs"
                    }
                  >
                    {u.tag} <span className="text-faint tabular-nums">{u.leads}</span>
                  </Link>
                ))}
              </div>
            )}
            <LeadViewsBar slug={slug} views={views} currentQuery={currentQuery} />
          </div>
        )}
        {leads.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            {all.length === 0
              ? "No lead rows on this sheet yet."
              : filtered
                ? "No lead matches these filters."
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
              <tbody className="gv-rows">
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
                      {(tags.get(l.email.toLowerCase()) ?? []).length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {tags.get(l.email.toLowerCase())!.map((t) => (
                            <span
                              key={t}
                              className="text-muted-foreground rounded-full border px-1.5 text-[10px]"
                            >
                              {t}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground py-2 pr-4">
                      {l.reps[0] ? displayName(l.reps[0]) : "—"}
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
                    <td className="max-w-56 truncate py-2 pr-4">
                      {l.latestStatus ? (
                        <StatusChip status={l.latestStatus} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                Showing the 200 most recent of {leads.length}. Search or filter to
                narrow.
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
