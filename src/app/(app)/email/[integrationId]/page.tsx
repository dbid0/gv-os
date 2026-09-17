import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MailOpen, MousePointerClick, UserMinus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { ColumnChart } from "@/components/ui/column-chart";
import { Kpi } from "@/components/ui/metric";
import { buttonVariants } from "@/components/ui/button";
import { chartColorForClient, latestPerDay } from "@/lib/charts";
import { emailOfferStats } from "@/lib/email/offer-stats";
import {
  broadcastStatsByConnection,
  kitGrowthByConnection,
  latestKitOverview,
} from "@/lib/email/queries";
import { recentSends } from "@/lib/email/recent-sends";
import { cn } from "@/lib/utils";
import { viewerTimeZone } from "@/lib/time/viewer-zone";

export const metadata = { title: "Email — offer - GV OS" };
export const dynamic = "force-dynamic";

/**
 * One account's full profile — its sends first.
 *
 * This page used to open on four inventory tiles (subscribers, sequences,
 * active sequences, tags) and end on a panel promising that per-email open
 * rates would arrive "once the Kit sync captures per-email stats". It captures
 * them; the promise outlived its own reason. The sends and their rates are
 * what this page is for, so they lead it, and the roster follows.
 *
 * Every rate is computed per send over that send's own recipients, and a rate
 * with no denominator prints as a dash. A send with Kit's open tracking off
 * says so rather than showing 0%, which would read as a failed email.
 */

const fmtWhen = (d: Date, timeZone: string) =>
  new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

const fmtDay = (d: Date, timeZone: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
const count = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"));

export default async function EmailOfferPage({
  params,
}: {
  params: Promise<{ integrationId: string }>;
}) {
  const tz = await viewerTimeZone();
  const { integrationId } = await params;
  const [accounts, growthSamples, statsByConnection] = await Promise.all([
    latestKitOverview(),
    kitGrowthByConnection(),
    broadcastStatsByConnection(),
  ]);
  const account = accounts.find((a) => a.integrationId === integrationId);
  if (!account) notFound();

  const growth = latestPerDay(growthSamples.get(integrationId) ?? [], tz);
  const broadcasts = statsByConnection.get(integrationId) ?? [];
  const stats = emailOfferStats(broadcasts);
  const sends = recentSends(broadcasts);
  const active = account.sequences.filter((s) => !s.hold).length;
  const paused = account.sequences.length - active;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={account.clientName ?? "Agency"}
        description={account.accountName ?? account.label}
        status={
          <StatusPill tone="live">
            {account.plan ?? "Kit"} · synced {fmtWhen(account.takenAt, tz)}
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
          label="Open rate"
          value={pct(stats.openRatePct)}
          icon={MailOpen}
          tone="brand"
        />
        <Kpi
          label="Click rate"
          value={pct(stats.clickRatePct)}
          icon={MousePointerClick}
        />
        <Kpi
          label="Unsubscribed"
          value={stats.unsubscribes.toLocaleString("en-US")}
          icon={UserMinus}
        />
        <Kpi
          label="Last send"
          value={stats.lastSentAt === null ? "—" : fmtDay(stats.lastSentAt, tz)}
        />
      </div>

      <Panel
        title="Sends"
        aside={
          <span className="text-faint text-xs">
            {stats.sent === 0
              ? "none yet"
              : `${stats.measuredRecipients.toLocaleString("en-US")} recipients measured`}
          </span>
        }
      >
        {sends.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            This account has not sent a broadcast.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead className="text-faint border-b text-left text-[11px] tracking-wider uppercase">
                <tr>
                  <th className="py-2 pr-3 font-medium">Subject</th>
                  <th className="py-2 pr-3 font-medium">Sent</th>
                  <th className="py-2 pr-3 text-right font-medium">Recipients</th>
                  <th className="py-2 pr-3 text-right font-medium">Open</th>
                  <th className="py-2 pr-3 text-right font-medium">Click</th>
                  <th className="py-2 text-right font-medium">Unsub</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="max-w-xs truncate py-2 pr-3">
                      {s.subject ?? <span className="text-faint">No subject</span>}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                      {fmtDay(s.sentAt, tz)}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                      {count(s.recipients)}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">
                      {s.openTrackingDisabled ? (
                        <span className="text-faint">not tracked</span>
                      ) : (
                        pct(s.openRatePct)
                      )}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                      {pct(s.clickRatePct)}
                    </td>
                    <td className="text-muted-foreground py-2 text-right tabular-nums">
                      {count(s.unsubscribes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

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

      <Panel title="The list">
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi label="Subscribers" value={count(account.subscriberCount)} />
          <Kpi label="Sequences" value={String(account.sequenceCount)} />
          <Kpi label="Tags" value={String(account.tagCount)} />
        </div>
        {growth.length >= 2 && (
          <div className="mt-4 border-t pt-4">
            <ColumnChart
              data={growth}
              color={chartColorForClient(account.clientName)}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
