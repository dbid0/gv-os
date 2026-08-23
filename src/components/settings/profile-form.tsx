"use client";

import { useState, useTransition } from "react";

import { saveProfile } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

export function ProfileForm({
  initialName,
  initialDiscord,
}: {
  initialName: string;
  initialDiscord: string;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialName);
  const [discord, setDiscord] = useState(initialDiscord);

  return (
    <Panel title="Details">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            try {
              await saveProfile({ displayName: name, discordHandle: discord });
              toast({ tone: "success", title: "Profile saved" });
            } catch (err) {
              toast({
                tone: "error",
                title: err instanceof Error ? err.message : "Save failed.",
              });
            }
          });
        }}
      >
        <label className="text-faint flex flex-col gap-1 text-[11px]">
          Display name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How you appear in the app"
            className="h-9 max-w-sm text-sm"
          />
        </label>
        <label className="text-faint flex flex-col gap-1 text-[11px]">
          Discord handle
          <Input
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            placeholder="e.g. daniel — DM notifications wire in with integrations"
            className="h-9 max-w-sm text-sm"
          />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      <p className="text-faint mt-4 text-[11px]">
        Sign-in is a magic link to your allowlisted email — there is no password to
        reset by design. Changing the email means changing the allowlist.
      </p>
    </Panel>
  );
}
