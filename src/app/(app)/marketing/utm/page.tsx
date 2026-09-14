import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";

import { CopyLinkButton } from "@/components/marketing/copy-link-button";
import { UtmLinkForm } from "@/components/marketing/utm-link-form";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportCsv } from "@/components/ui/export-csv";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { viewerIsAdmin } from "@/lib/auth/viewer";
import { shortUrl } from "@/lib/marketing/short-link";
import { listUtmLinks } from "@/lib/marketing/utm-links";
import { listTeams } from "@/lib/sales/queries";

export const metadata = { title: "UTM links - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The UTM builder + registry (v2 scope: builder + registry only — reading
 * attribution back off a booking/application, and any non-admin role access,
 * are deliberate follow-ups, not this page's job).
 *
 * Agency tooling, not client-facing: absent from every non-admin role's
 * route grants (lib/auth/roles.ts) so the middleware already 404s/redirects
 * anyone but an admin before this ever renders. The check below is
 * defense-in-depth, the same belt-and-suspenders the client-portal admin
 * surfaces use (see app/w/[slug]/tracking/page.tsx).
 */
export default async function UtmLinksPage() {
  // Short links are served by this deployment, under its configured origin.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!(await viewerIsAdmin())) notFound();

  const [teams, rows] = await Promise.all([listTeams(), listUtmLinks()]);
  const clients = teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="UTM"
        highlight="links."
        description="Every public client link, born tagged. Generating a link here writes it straight into the registry below — no separate step, so nothing shipped untracked."
        status={
          <StatusPill tone={rows.length ? "live" : "muted"}>
            {rows.length} generated
          </StatusPill>
        }
      />

      <Panel title="Generate a link">
        <UtmLinkForm clients={clients} />
      </Panel>

      {rows.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No links generated yet"
          explainer="Every link above is saved here the moment it's generated — this is the full history of what's gone out."
        />
      ) : (
        <Panel
          title="Registry — newest first"
          padded={false}
          aside={
            <ExportCsv
              filename="utm-links.csv"
              headers={[
                "Client",
                "Source",
                "Medium",
                "Campaign",
                "Content",
                "Destination",
                "Assembled URL",
                "Short link",
                "Clicks",
                "Last clicked",
                "Created by",
                "Created at",
              ]}
              rows={rows.map((r) => [
                r.clientName,
                r.utmSource,
                r.utmMedium,
                r.utmCampaign,
                r.utmContent,
                r.destinationUrl,
                r.assembledUrl,
                r.shortCode ? shortUrl(origin, r.shortCode) : "",
                String(r.clickCount),
                r.lastClickedAt ? r.lastClickedAt.toISOString() : "",
                r.createdBy ?? "",
                r.createdAt.toISOString(),
              ])}
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-[11px] tracking-wider uppercase">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Medium</th>
                  <th className="px-4 py-2.5 font-medium">Campaign</th>
                  <th className="px-4 py-2.5 font-medium">Content</th>
                  <th className="px-4 py-2.5 font-medium">Short link</th>
                  <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                  <th className="px-4 py-2.5 font-medium">Full link</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-secondary/40 border-b transition-colors last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {r.clientName}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                      {r.utmSource}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                      {r.utmMedium}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                      {r.utmCampaign}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                      {r.utmContent}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {r.shortCode ? (
                        <span className="inline-flex items-center gap-1.5">
                          <code className="text-brand text-xs">/l/{r.shortCode}</code>
                          <CopyLinkButton url={shortUrl(origin, r.shortCode)} />
                        </span>
                      ) : (
                        <span className="text-faint text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className="numeric tabular-nums">
                        {r.clickCount.toLocaleString("en-US")}
                      </span>
                      <span className="text-faint block text-[10px]">
                        {r.lastClickedAt
                          ? `last ${r.lastClickedAt.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}`
                          : "no clicks yet"}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs">
                      {r.assembledUrl}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                      {r.createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CopyLinkButton url={r.assembledUrl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
