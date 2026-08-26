import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { buttonVariants } from "@/components/ui/button";
import { latestKitOverview } from "@/lib/email/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Email sequence - GV OS" };
export const dynamic = "force-dynamic";

export default async function EmailSequencePage({
  params,
}: {
  params: Promise<{ integrationId: string; seqId: string }>;
}) {
  const { integrationId, seqId } = await params;
  const accounts = await latestKitOverview();
  const account = accounts.find((a) => a.integrationId === integrationId);
  if (!account) notFound();
  const sequence = account.sequences.find((s) => String(s.id) === seqId);
  if (!sequence) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title={sequence.name}
        description={`${account.clientName ?? "Agency"} · ${account.accountName ?? account.label}`}
        status={
          <StatusPill tone={sequence.hold ? "muted" : "live"}>
            {sequence.hold ? "Paused" : "Active"}
          </StatusPill>
        }
        actions={
          <Link
            href={`/email/${integrationId}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> Back to account
          </Link>
        }
      />

      {/* The copy preview Daniel wants (hand the copywriter exactly what to edit)
          needs each email's subject + body captured from Kit. Until the content
          sync runs against a live key, we show the sequence's state honestly and
          never fabricate email copy. */}
      <Panel
        title="Email-by-email preview"
        aside={<StatusPill tone="pending">Waiting on Kit content sync</StatusPill>}
      >
        <div className="text-faint flex flex-col items-center gap-3 py-10 text-center">
          <FileText className="size-7 opacity-60" />
          <p className="text-muted-foreground max-w-xl text-sm">
            Each email in{" "}
            <span className="text-foreground font-medium">{sequence.name}</span> — its
            subject line and body — will preview here once the Kit sync captures
            sequence content for this account. From this view you&apos;ll be able to
            read the live copy and tell the copywriter exactly which email to edit.
            Nothing is shown until the real content is pulled.
          </p>
        </div>
      </Panel>
    </div>
  );
}
