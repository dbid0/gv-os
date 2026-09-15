import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Waypoints } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { WindowChips } from "@/components/ui/window-chips";
import { dayKeyCT } from "@/lib/charts";
import {
  isBounded,
  readReportRange,
  reportBounds,
  type ReportRange,
} from "@/lib/tracking/report-window";
import { WsPageHeader } from "@/components/workspace/ws-page-header";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { viewerRole } from "@/lib/auth/viewer";
import { isPortalView } from "@/lib/clients/portal-visibility";
import { rosterClientBySlug } from "@/lib/roster-server";
import {
  SOURCE_DIMENSIONS,
  type SourceDimension,
  type SourceRow,
} from "@/lib/tracking/source-funnel";
import { loadSourceFunnel } from "@/lib/tracking/source-funnel-loader";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  return { title: client ? `${client.name} Sources - GV OS` : "Sources - GV OS" };
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"));

function Row({ r, total = false }: { r: SourceRow; total?: boolean }) {
  return (
    <tr className={cn(total && "bg-secondary/40 font-medium")}>
      <th
        scope="row"
        className={cn(
          "px-4 py-2 text-left font-normal",
          total ? "font-medium" : r.unattributed && "text-muted-foreground italic",
        )}
      >
        {r.value}
      </th>
      <td className="px-3 py-2 text-right tabular-nums">{num(r.clicks)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.applicants}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.bookedPeople}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pct(r.bookRate)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.held}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.shows}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pct(r.showRate)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.closes}</td>
      <td className="px-4 py-2 text-right tabular-nums">{pct(r.closeRate)}</td>
    </tr>
  );
}

/**
 * Sources — the offer's funnel re-cut by where people came from: UTM link
 * clicks, applicants, booked, held calls, shows and closes per source, medium
 * or campaign, reconciling to the total line.
 *
 * GV's attribution read — never a client portal page (same gate as Calls).
 */
export default async function WorkspaceSourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();
  const [cookiePortal, role, sp] = await Promise.all([
    isPortalView(),
    viewerRole(),
    searchParams,
  ]);
  if (cookiePortal || role === "client") notFound();

  const dimension: SourceDimension = SOURCE_DIMENSIONS.some((d) => d.key === sp.by)
    ? (sp.by as SourceDimension)
    : "source";
  const range = readReportRange(sp.range);
  const bounds = reportBounds(range, dayKeyCT(new Date()));
  const hrefWith = (next: { by?: SourceDimension; range?: ReportRange }) => {
    const q = new URLSearchParams();
    const by = next.by ?? dimension;
    const r = next.range ?? range;
    if (by !== "source") q.set("by", by);
    if (r !== "life") q.set("range", r);
    const qs = q.toString();
    return qs ? `/w/${slug}/sources?${qs}` : `/w/${slug}/sources`;
  };

  const header = (
    <WsPageHeader
      icon={Waypoints}
      title="Sources"
      lede="Where this offer's buyers came from — UTM link clicks through applications, booked calls, shows and closes, by source, medium or campaign."
    />
  );

  const [row] = await getDb()
    .select({ id: clients.id, countedCallSources: clients.countedCallSources })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  if (!row) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Waypoints}
          title="No client record yet"
          explainer={`${client.name} needs its client record before sources can be read.`}
        />
      </div>
    );
  }

  const data = await loadSourceFunnel(
    row.id,
    row.countedCallSources ?? null,
    dimension,
    new Date(),
    bounds,
  );
  const { rows, total } = data.funnel;

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex rounded-md border p-0.5 sm:w-fit" aria-label="Cut by">
          {SOURCE_DIMENSIONS.map((d) => (
            <Link
              key={d.key}
              href={hrefWith({ by: d.key })}
              aria-current={dimension === d.key ? "page" : undefined}
              className={cn(
                "rounded px-3 py-1 text-xs transition-colors",
                dimension === d.key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              By {d.label.toLowerCase()}
            </Link>
          ))}
        </nav>
        <WindowChips active={range} hrefFor={(r) => hrefWith({ range: r })} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Waypoints}
          title="Nothing to attribute yet"
          explainer="Sources fill in from UTM links generated in GV OS, applications synced from the form, and calls on the counted calendar."
        />
      ) : (
        <section className="bg-card rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="text-faint border-b text-[11px] tracking-wider whitespace-nowrap uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    {SOURCE_DIMENSIONS.find((d) => d.key === dimension)!.label}
                  </th>
                  {[
                    "Clicks",
                    "Applicants",
                    "Booked",
                    "Book rate",
                    "Held",
                    "Shows",
                    "Show rate",
                    "Closes",
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Close rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <Row key={r.value} r={r} />
                ))}
              </tbody>
              <tfoot className="border-t">
                <Row r={total} total />
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {data.applications > 0 && data.taggedApplications === 0 && (
        <p className="text-warning text-xs">
          None of the {data.applications.toLocaleString("en-US")} synced applications
          carries a UTM tag, so every applicant sits in {"“(no tag)”"}. The funnel links
          need to pass their UTMs into the application form&apos;s hidden fields.
        </p>
      )}

      {isBounded(bounds) && (
        <p className="text-faint text-xs">
          {bounds.label}: applicants whose first application was in the window and calls
          that started in it; each person keeps the source from their whole history.
          Clicks show only for All time — the registry counts clicks all-time.
        </p>
      )}

      <p className="text-faint text-xs">
        A person counts under the first tag they applied with; someone who only applied
        through untagged links is {"“(no tag)”"}, and a booked call with no application
        is {"“(no application)”"}. Calls follow the person (merged inboxes included).
        Clicks are the UTM registry&apos;s counts for links with that tag —{" “—”"} when
        no link generated in GV OS carries it. Held, shows and closes read the same
        outcomes as the Calls page. Book rate = applicants who booked a call that
        wasn&apos;t cancelled.
      </p>
    </div>
  );
}
