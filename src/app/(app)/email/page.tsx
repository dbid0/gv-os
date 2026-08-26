import Link from "next/link";

import { EmailOverview } from "@/components/email/email-overview";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { latestPerDay, type DayBucket } from "@/lib/charts";
import { kitGrowthByConnection, latestKitOverview } from "@/lib/email/queries";

export const metadata = { title: "Email - GV OS" };
export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const [accounts, growthSamples] = await Promise.all([
    latestKitOverview(),
    kitGrowthByConnection(),
  ]);
  const growth: Record<string, DayBucket[]> = {};
  for (const [integrationId, samples] of growthSamples) {
    growth[integrationId] = latestPerDay(samples);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="The"
        highlight="email engine."
        status={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone={accounts.length ? "live" : "muted"}>
              {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
            </StatusPill>
            {accounts.length > 0 && (
              <span className="text-faint text-xs">Auto-syncing from Kit</span>
            )}
          </span>
        }
      />

      {accounts.length === 0 ? (
        <Panel title="No Kit accounts yet">
          <p className="text-faint py-8 text-center text-sm">
            Connect a client&apos;s Kit key under{" "}
            <Link href="/settings/integrations" className="text-brand">
              Settings → Integrations
            </Link>{" "}
            and the account appears here after the first sync.
          </p>
        </Panel>
      ) : (
        <EmailOverview accounts={accounts} growth={growth} />
      )}
    </div>
  );
}
