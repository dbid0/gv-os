import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Tag, Users } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { ColumnChart } from "@/components/ui/column-chart";
import { Kpi } from "@/components/ui/metric";
import { buttonVariants } from "@/components/ui/button";
import { chartColorForClient, latestPerDay } from "@/lib/charts";
import { kitGrowthByConnection, latestKitOverview } from "@/lib/email/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Email — offer - GV OS" };
export const dynamic = "force-dynamic";

const fmtWhen = (d: Date) =>
  new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

export default async function EmailOfferPage({
  params,
}: {
  params: Promise<{ integrationId: string }>;
}) {
  const { integrationId } = await params;
  const [accounts, growthSamples] = await Promise.all([
    latestKitOverview(),
    kitGrowthByConnection(),
  ]);
  const account = accounts.find((a) => a.integrationId === integrationId);
  if (!account) notFound();

  const growth = latestPerDay(growthSamples.get(integrationId) ?? []);
  const active = account.sequences.filter((s) => !s.hold).length;
  const paused = account.sequences.length - active;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={account.clientName ?? "Agency"}
        description={account.accountName ?? account.label}
        status={
          <StatusPill tone="live">
            {account.plan ?? "Kit"} · synced {fmtWhen(account.takenAt)}
          </StatusPill>
        }
        actions={
          <Link
            href="/email"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> All accounts
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Subscribers"
          value={
            account.subscriberCount === null
              ? "—"
              : account.subscriberCount.toLocaleString("en-US")
          }
          icon={Users}
          tone="brand"
        />
        <Kpi label="Sequences" value={String(account.sequenceCount)} icon={Mail} />
        <Kpi label="Active sequences" value={String(active)} tone="success" />
        <Kpi label="Tags" value={String(account.tagCount)} icon={Tag} />
      </div>

      {growth.length >= 2 && (
        <Panel title="List growth — daily">
          <ColumnChart data={growth} color={chartColorForClient(account.clientName)} />
        </Panel>
      )}

      <Panel
        title="Sequences"
        aside={
          <span className="text-faint text-xs">
            {active} active · {paused} paused
          </span>
        }
      >
        {account.sequences.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            No sequences captured on the last sync.
          </p>
        ) : (
          <div className="space-y-1.5">
            {account.sequences.map((s) => (
              <Link
                key={s.id}
                href={`/email/${integrationId}/sequence/${s.id}`}
                className="hover:bg-secondary/50 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
              >
                <span className={cn("truncate", s.hold && "text-faint")}>{s.name}</span>
                <StatusPill tone={s.hold ? "muted" : "live"}>
                  {s.hold ? "Paused" : "Active"}
                </StatusPill>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {/* Honest boundary: what we capture today is the sequence roster + list
          size. Per-email open/click performance and the actual copy preview
          require the richer Kit sync (per-email stats + content), which lands
          when this offer's Kit key is live. Nothing is invented until then. */}
      <Panel
        title="Per-email performance & copy preview"
        aside={<StatusPill tone="pending">Waiting on Kit content sync</StatusPill>}
      >
        <p className="text-muted-foreground text-sm">
          Open and click rates per email, and a preview of each sequence&apos;s actual
          copy (so you can hand the copywriter exactly what to edit), land here once the
          Kit sync captures per-email stats and content for{" "}
          {account.clientName ?? "this"} account. Today&apos;s sync captures the
          sequence roster and list size — nothing on this page is estimated.
        </p>
      </Panel>
    </div>
  );
}
