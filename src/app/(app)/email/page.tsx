import Link from "next/link";

import { EmailOverview, KitSyncButton } from "@/components/email/email-overview";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { latestKitOverview } from "@/lib/email/queries";

export const metadata = { title: "Email - GV OS" };
export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const accounts = await latestKitOverview();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="The"
        highlight="email engine."
        description="Every client's Kit account, pulled through the vault on the daily schedule — sequences, tags, and plan health in one place. Snapshots accumulate per sync, so growth becomes chartable over time."
        status={
          <StatusPill tone={accounts.length ? "live" : "muted"}>
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
          </StatusPill>
        }
        actions={<KitSyncButton />}
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
        <EmailOverview accounts={accounts} />
      )}
    </div>
  );
}
