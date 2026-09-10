import { cookies } from "next/headers";
import { Mail } from "lucide-react";
import { WsPageHeader } from "@/components/workspace/ws-page-header";
import { notFound } from "next/navigation";

import { ConnectKitCard } from "@/components/email/connect-kit-card";

import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/ui/column-chart";
import { Kpi } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { chartColorForClient, latestPerDay } from "@/lib/charts";
import {
  broadcastsForClient,
  kitGrowthByConnection,
  latestKitOverview,
} from "@/lib/email/queries";
import { rosterClientBySlug } from "@/lib/roster-server";
import { clientIdBySlug } from "@/lib/clients/id";
import { cn } from "@/lib/utils";
import { refreshProviderOnView } from "@/lib/integrations/refresh-on-view";

export const dynamic = "force-dynamic";

/** Workspace Email: this client's Kit account — list size, sequences, growth. */
export default async function WorkspaceEmailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Live when you're looking: kick a kit pull after the response.
  refreshProviderOnView("kit");
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();

  const [accounts, growthSamples, clientId] = await Promise.all([
    latestKitOverview(),
    kitGrowthByConnection(),
    clientIdBySlug(slug),
  ]);
  // Matched by id — a shared display name must not surface another client's
  // list here (see lib/clients/attribution).
  const account =
    accounts.find((a) => clientId !== null && a.clientId === clientId) ?? null;
  const emails = clientId ? await broadcastsForClient(clientId) : [];
  const growth = account
    ? latestPerDay(growthSamples.get(account.integrationId) ?? [])
    : [];

  if (!account) {
    // GV's own view gets the key form right here; a client's portal states
    // the fact plainly and never shows a credential input.
    const portalView = (await cookies()).get("gv-dev-role")?.value === "client";
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <WsPageHeader
          icon={Mail}
          title="Email"
          lede="The offer's email engine, read straight from Kit — list growth, broadcasts, and sequences. Reporting only; nothing sends from here."
        />
        {portalView || clientId === null ? (
          <Panel title="No Kit account connected">
            <p className="text-faint py-8 text-center text-sm">
              Email isn&apos;t wired up for this offer yet.
            </p>
          </Panel>
        ) : (
          <ConnectKitCard clientId={clientId} clientName={client.name} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <WsPageHeader
        icon={Mail}
        title="Email"
        lede="The offer's email engine, read straight from Kit — list growth, broadcasts, and sequences. Reporting only; nothing sends from here."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Subscribers"
          value={
            account.subscriberCount !== null
              ? account.subscriberCount.toLocaleString("en-US")
              : "—"
          }
          tone="brand"
        />
        <Kpi label="Sequences" value={String(account.sequenceCount)} />
        <Kpi label="Tags" value={String(account.tagCount)} />
      </div>

      {growth.length >= 2 && (
        <Panel title="List growth — daily">
          <ColumnChart data={growth} color={chartColorForClient(client.name)} />
        </Panel>
      )}

      {emails.length > 0 && (
        <Panel
          title="Emails sent"
          aside={
            <span className="text-faint text-xs">
              stats as Kit reports them — opens keep arriving after send
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint text-left text-[11px] tracking-wider uppercase">
                  <th className="py-1.5 pr-3 font-medium">Email</th>
                  <th className="px-3 py-1.5 text-right font-medium">Sent</th>
                  <th className="px-3 py-1.5 text-right font-medium">Recipients</th>
                  <th className="px-3 py-1.5 text-right font-medium">Opens</th>
                  <th className="px-3 py-1.5 text-right font-medium">Open rate</th>
                  <th className="px-3 py-1.5 text-right font-medium">Clicks</th>
                  <th className="px-3 py-1.5 text-right font-medium">Unsubs</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {emails.map((e) => (
                  <tr key={e.externalId}>
                    <td className="max-w-72 truncate py-2 pr-3 font-medium">
                      {e.subject ?? "(no subject)"}
                    </td>
                    <td className="text-muted-foreground numeric px-3 py-2 text-right whitespace-nowrap">
                      {e.sentAt
                        ? e.sentAt.toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            timeZone: "America/Chicago",
                          })
                        : "—"}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {e.recipients ?? "—"}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {e.emailsOpened ?? "—"}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {e.openTrackingDisabled
                        ? "off"
                        : e.openRateBps !== null
                          ? `${(e.openRateBps / 100).toFixed(1)}%`
                          : "—"}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {e.totalClicks ?? "—"}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {e.unsubscribes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Sequences">
        <div className="space-y-1.5">
          {account.sequences.slice(0, 20).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span className={cn("truncate", s.hold && "text-faint")}>{s.name}</span>
              <StatusPill tone={s.hold ? "muted" : "good"}>
                {s.hold ? "Paused" : "Active"}
              </StatusPill>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
