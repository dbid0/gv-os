"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mail, RefreshCw, Tag } from "lucide-react";

import { syncKitNow } from "@/app/(app)/email/actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import type { KitOverviewRow } from "@/lib/email/queries";
import { cn } from "@/lib/utils";

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

const fmtWhen = (d: Date) =>
  new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function EmailOverview({ accounts }: { accounts: KitOverviewRow[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {accounts.map((a) => (
        <Panel key={a.integrationId} title={a.clientName ?? "Agency"}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-medium">{a.accountName ?? a.label}</span>
              {a.plan && (
                <span className="text-faint rounded-full border px-1.5 text-[11px]">
                  {a.plan}
                </span>
              )}
            </div>

            <div className="text-muted-foreground flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3.5" /> {a.sequenceCount} sequences
              </span>
              <span className="inline-flex items-center gap-1">
                <Tag className="size-3.5" /> {a.tagCount} tags
              </span>
            </div>

            <div className="space-y-1.5">
              {a.sequences.slice(0, 12).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className={cn("truncate", s.hold && "text-faint")}>
                    {s.name}
                  </span>
                  <StatusPill tone={s.hold ? "muted" : "live"}>
                    {s.hold ? "Paused" : "Active"}
                  </StatusPill>
                </div>
              ))}
              {a.sequences.length > 12 && (
                <p className="text-faint text-xs">+{a.sequences.length - 12} more</p>
              )}
            </div>

            <p className="text-faint border-t pt-2 text-[11px]">
              Last synced {fmtWhen(a.takenAt)}
            </p>
          </div>
        </Panel>
      ))}
    </div>
  );
}
