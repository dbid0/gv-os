"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { KeyRound, Plug } from "lucide-react";

import { connectIntegration } from "@/app/(app)/settings/integrations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
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
    <EmptyState
      icon={Plug}
      title={`${clientName}'s email engine isn't connected yet`}
      explainer="Paste the account's Kit v4 API key. It is sealed before it is stored, and the list, sequences and growth appear here after the first sync — which starts the moment you connect."
      action={
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
      }
    />
  );
}
