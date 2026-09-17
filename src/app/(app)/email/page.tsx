import Link from "next/link";

import { EmailOverview } from "@/components/email/email-overview";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { broadcastStatsByConnection, latestKitOverview } from "@/lib/email/queries";
import { refreshProviderOnView } from "@/lib/integrations/refresh-on-view";

export const metadata = { title: "Email - GV OS" };
export const dynamic = "force-dynamic";

export default async function EmailPage() {
  // Live when you're looking: kick a kit pull after the response.
  refreshProviderOnView("kit");
  const [accounts, statsByConnection] = await Promise.all([
    latestKitOverview(),
    broadcastStatsByConnection(),
  ]);

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
        <EmailOverview
          accounts={accounts}
          broadcasts={Object.fromEntries(statsByConnection)}
        />
      )}
    </div>
  );
}
