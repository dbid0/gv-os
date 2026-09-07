"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { KeyRound, Plug } from "lucide-react";

import { connectIntegration } from "@/app/(app)/settings/integrations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

/**
 * Authenticate Kit from INSIDE the client's email section — paste the key
 * where you noticed it was missing, instead of a detour through Settings.
 * Same server action as the Integrations page (sealed before insert, plaintext
 * never returned), scoped to this client, synced immediately on connect.
 *
 * Rendered only on GV's own view — a client's portal never shows a key form.
 */
export function ConnectKitCard({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [secret, setSecret] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!secret.trim()) return;
    start(async () => {
      try {
        await connectIntegration({
          provider: "kit",
          label: `${clientName} Kit`,
          method: "api_key",
          secret: secret.trim(),
          clientId,
        });
        setSecret("");
        toast({
          tone: "success",
          title: "Kit connected — first sync is already running.",
        });
        router.refresh();
      } catch (err) {
        toast({
          tone: "error",
          title: err instanceof Error ? err.message : "Could not connect Kit.",
        });
      }
    });
  }

  return (
    <Panel title="Connect Kit">
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="bg-brand-soft/40 text-brand grid size-12 place-items-center rounded-full border">
          <Plug className="size-5" />
        </span>
        <div>
          <p className="text-sm font-medium">
            {clientName}&apos;s email engine isn&apos;t connected yet.
          </p>
          <p className="text-faint mx-auto mt-1 max-w-md text-xs">
            Paste the account&apos;s Kit v4 API key. It is sealed before it is stored,
            and the list, sequences and growth appear here after the first sync — which
            starts the moment you connect.
          </p>
        </div>
        <form onSubmit={submit} className="flex w-full max-w-md items-center gap-2">
          <div className="relative flex-1">
            <KeyRound className="text-faint absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="kit_xxxxxxxxxxxx"
              className="pl-8"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={pending || !secret.trim()}>
            {pending ? "Connecting…" : "Connect"}
          </Button>
        </form>
      </div>
    </Panel>
  );
}
