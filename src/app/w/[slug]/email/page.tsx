import { notFound } from "next/navigation";

import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/ui/column-chart";
import { Kpi } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { chartColorForClient, latestPerDay } from "@/lib/charts";
import { kitGrowthByConnection, latestKitOverview } from "@/lib/email/queries";
import { clientBySlug } from "@/lib/roster";
import { clientIdBySlug } from "@/lib/clients/id";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Workspace Email: this client's Kit account — list size, sequences, growth. */
export default async function WorkspaceEmailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
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
  const growth = account
    ? latestPerDay(growthSamples.get(account.integrationId) ?? [])
    : [];

  if (!account) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <Panel title="No Kit account connected">
          <p className="text-faint py-8 text-center text-sm">
            Connect this client&apos;s Kit key under Settings → Integrations and the
            email engine appears here after the first sync.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
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
