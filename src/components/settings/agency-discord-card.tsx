"use client";

import Link from "next/link";
import { useTransition } from "react";
import { BarChart3, Send } from "lucide-react";

import { ClipboardList } from "lucide-react";

import {
  postDigest,
  sendAgencySnapshot,
  sendDiscordTest,
} from "@/app/(app)/settings/discord-actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

/**
 * Agency Discord sync controls. The webhook is connected under Integrations
 * (sealed in the vault); these buttons post to it on demand — a connectivity
 * test and the live agency snapshot. Nothing fires on a schedule.
 */
export function AgencyDiscordCard() {
  const { toast } = useToast();
  const [testing, startTest] = useTransition();
  const [posting, startPost] = useTransition();
  const [digesting, startDigest] = useTransition();

  const run = (
    fn: () => Promise<{ sent: boolean }>,
    start: (cb: () => void) => void,
    okTitle: string,
  ) =>
    start(async () => {
      try {
        await fn();
        toast({ tone: "success", title: okTitle });
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Could not reach Discord.",
        });
      }
    });

  return (
    <Panel title="Agency Discord">
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Push GV OS updates into the agency Discord HQ. Connect the channel&apos;s
          webhook under{" "}
          <Link href="/settings/integrations" className="text-brand hover:underline">
            Integrations → Discord
          </Link>
          , then post the agency snapshot here or test the connection.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              run(sendAgencySnapshot, startPost, "Snapshot posted to Discord")
            }
            disabled={posting}
            className="gap-1.5"
          >
            <BarChart3 className="size-3.5" />
            {posting ? "Posting…" : "Post agency snapshot"}
          </Button>
          <Button
            variant="outline"
            onClick={() => run(postDigest, startDigest, "Huddle digest posted")}
            disabled={digesting}
            className="gap-1.5"
          >
            <ClipboardList className="size-3.5" />
            {digesting ? "Posting…" : "Post huddle digest"}
          </Button>
          <Button
            variant="outline"
            onClick={() => run(sendDiscordTest, startTest, "Test message sent")}
            disabled={testing}
            className="gap-1.5"
          >
            <Send className="size-3.5" />
            {testing ? "Sending…" : "Send test message"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
