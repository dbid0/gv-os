"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowUpRight,
  MailOpen,
  MousePointerClick,
  RefreshCw,
  UserMinus,
} from "lucide-react";

import { syncKitNow } from "@/app/(app)/email/actions";
import { Button } from "@/components/ui/button";
import { Kpi } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { emailCoverage } from "@/lib/email/coverage";
import { emailOfferStats } from "@/lib/email/offer-stats";
import type { KitOverviewRow } from "@/lib/email/queries";
import { recentSends, type SendRecord } from "@/lib/email/recent-sends";
import { useViewerTimeZone } from "@/components/shell/time-zone";

/**
 * EMAIL, LED BY WHETHER IT LANDS.
 *
 * This page used to open on inventory — subscribers, sequence counts, tags, a
 * list-growth chart and twelve sequence names per card. Daniel's read is that
 * none of that is the question. So the account card now leads with its open
 * and click rate and the sends behind them, and the whole of the inventory is
 * one line at the bottom. The sequence list still exists — on the account's
 * own page, which is what clicking through is for.
 *
 * Rates are pooled across sends and WEIGHTED BY RECIPIENTS (offer-stats), so a
 * test send to a dozen people cannot move a headline. A rate nothing was
 * measured over is a dash, never 0%.
 */

export function KitSyncButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              const out = await syncKitNow();
              toast({
                tone: "success",
                title: `${out.connections} Kit ${out.connections === 1 ? "account" : "accounts"} synced`,
              });
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Sync failed.");
            }
          });
        }}
        disabled={pending}
        className="gap-2"
      >
        <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
        {pending ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}

const fmtDay = (d: Date, timeZone: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });

/** A rate nothing was measured over is unknown — a dash, never 0%. */
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);

const count = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"));

export function EmailOverview({
  accounts,
  broadcasts = {},
  now,
}: {
  accounts: KitOverviewRow[];
  /** Each connection's sends. Every rate on this page derives from these. */
  broadcasts?: Record<string, SendRecord[]>;
  /** Passed in so the server and the browser agree on how old a rate is. */
  now: Date;
}) {
  const timeZone = useViewerTimeZone();
  const everySend = accounts.flatMap((a) => broadcasts[a.integrationId] ?? []);
  const agency = emailOfferStats(everySend);
  // What the headline does and does not cover. Kit reports stats for
  // broadcasts only — every sequence email is invisible to it — so a bare
  // rate can silently describe a fraction of the sending.
  const coverage = emailCoverage(
    agency.lastSentAt,
    accounts.flatMap((a) => a.sequences),
    now,
  );

  // Biggest sender first: the account whose email reaches the most people is
  // the one whose open rate moves the agency's. Ordering by subscriber count
  // ranked by list size — inventory again — and could put an account that has
  // never sent at the top of a page about sending.
  const cards = [...accounts]
    .map((a) => {
      const sends = broadcasts[a.integrationId] ?? [];
      return {
        account: a,
        stats: emailOfferStats(sends),
        sends: recentSends(sends, 4),
      };
    })
    .sort((x, y) => y.stats.recipients - x.stats.recipients);

  return (
    <div className="space-y-6">
      <section className="card-grad space-y-3 rounded-xl border p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Open rate"
            value={pct(agency.openRatePct)}
            icon={MailOpen}
            tone="brand"
          />
          <Kpi
            label="Click rate"
            value={pct(agency.clickRatePct)}
            icon={MousePointerClick}
          />
          <Kpi
            label="Unsubscribed"
            value={agency.unsubscribes.toLocaleString("en-US")}
            icon={UserMinus}
          />
          <Kpi
            label="Last send"
            value={
              agency.lastSentAt === null ? "—" : fmtDay(agency.lastSentAt, timeZone)
            }
          />
        </div>
        {/* Every rate names what it was measured over, WHEN, and what it
            could not see at all. Without the last two, a figure from two
            broadcasts six weeks ago reads as the state of the email program. */}
        <div className="space-y-1 border-t pt-3 text-xs">
          <p className={coverage.stale ? "text-warning" : "text-faint"}>
            {agency.sent === 0
              ? "No broadcasts sent yet."
              : `From ${agency.sent} broadcast${agency.sent === 1 ? "" : "s"} to ${agency.measuredRecipients.toLocaleString("en-US")} recipients${
                  agency.untrackedSends > 0
                    ? `, ${agency.untrackedSends} with open tracking off`
                    : ""
                }${
                  coverage.daysSinceLastSend === null
                    ? ""
                    : coverage.daysSinceLastSend === 0
                      ? " · sent today"
                      : ` · last sent ${coverage.daysSinceLastSend} days ago`
                }`}
          </p>
          {coverage.hasUnmeasured && (
            <p className="text-faint">
              {coverage.unmeasuredEmails} sequence email
              {coverage.unmeasuredEmails === 1 ? "" : "s"}
              {coverage.sequenceSubscribers !== null &&
                ` to ${coverage.sequenceSubscribers.toLocaleString("en-US")} subscriber${coverage.sequenceSubscribers === 1 ? "" : "s"}`}{" "}
              are not in these rates — Kit reports no stats for sequence emails.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map(({ account: a, stats, sends }) => (
          <Link
            key={a.integrationId}
            href={`/email/${a.integrationId}`}
            className="hover-lift block rounded-xl"
          >
            <Panel
              title={a.clientName ?? "Agency"}
              aside={<ArrowUpRight className="text-faint size-4" />}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Kpi label="Open" value={pct(stats.openRatePct)} tone="brand" />
                  <Kpi label="Click" value={pct(stats.clickRatePct)} />
                  <Kpi label="Sends" value={String(stats.sent)} />
                </div>

                {sends.length > 0 && (
                  <div className="space-y-1.5 border-t pt-3">
                    {sends.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="truncate">
                          {s.subject ?? <span className="text-faint">No subject</span>}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {fmtDay(s.sentAt, timeZone)} ·{" "}
                          <span className="text-foreground font-medium">
                            {pct(s.openRatePct)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-faint border-t pt-2 text-[11px]">
                  {count(a.subscriberCount)} subscribers · {a.sequenceCount} sequences ·{" "}
                  {a.tagCount} tags
                </p>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
