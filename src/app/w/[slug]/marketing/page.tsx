import { notFound } from "next/navigation";

import { Panel } from "@/components/ui/panel";
import { Kpi } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { latestKitOverview } from "@/lib/email/queries";
import { clientBySlug } from "@/lib/roster";

export const dynamic = "force-dynamic";

/**
 * Workspace Marketing — this offer's EMAIL, from Kit.
 *
 * Daniel: "that should be a full email breakdown from my Kit having Kit
 * connected… client assets and Drive are not part of marketing, that would just
 * be part of resources." So the Drive panel has moved out and this is the email
 * picture: the account, its list, and every sequence running on it.
 *
 * Read from `latestKitOverview` — the same snapshot the agency Email section
 * reads — so the two never disagree. With Kit unconnected the page says so
 * rather than rendering zeros that look like a dead list.
 */
export default async function WorkspaceMarketingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();

  const overview = await latestKitOverview().catch(() => []);
  const mine = overview.filter((k) => k.clientName === client.name);

  if (mine.length === 0) {
    return (
      <div className="space-y-6">
        <Panel
          title="Email — Kit"
          aside={<StatusPill tone="pending">Not connected</StatusPill>}
        >
          <p className="text-muted-foreground text-sm">
            {client.name}&apos;s Kit account isn&apos;t connected yet. Once its API key
            is added in Integrations, this fills in on the next sync: the list size,
            every sequence running, and how the list is growing.
          </p>
          <p className="text-faint mt-2 text-xs">
            Nothing is estimated here — an unconnected account shows nothing rather than
            zeros that read like a dead list.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mine.map((kit) => (
        <div key={kit.integrationId} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Subscribers"
              value={
                kit.subscriberCount === null
                  ? "—"
                  : kit.subscriberCount.toLocaleString("en-US")
              }
              tone="brand"
            />
            <Kpi label="Sequences" value={String(kit.sequenceCount)} />
            <Kpi label="Tags" value={String(kit.tagCount)} />
            <Kpi label="Plan" value={kit.plan ?? "—"} />
          </div>

          <Panel
            title="Sequences"
            aside={
              <span className="text-faint text-xs">
                {kit.accountName ?? kit.label} · synced{" "}
                {kit.takenAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            }
          >
            {kit.sequences.length === 0 ? (
              <p className="text-faint py-8 text-center text-sm">
                No sequences on this account yet.
              </p>
            ) : (
              <div className="divide-y">
                {kit.sequences.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                    <StatusPill tone={s.hold ? "pending" : "live"}>
                      {s.hold ? "paused" : "running"}
                    </StatusPill>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ))}
    </div>
  );
}
