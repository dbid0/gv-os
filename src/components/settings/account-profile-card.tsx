"use client";

import { useState, useTransition } from "react";

import { saveProfile } from "@/app/(app)/profile/actions";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/**
 * The Profile card body: photo, the read-only sign-in email, and the two
 * fields we actually persist (display name + Discord handle). Identity is the
 * magic-link email, so the email is shown but never editable here.
 */
export function AccountProfileCard({
  email,
  avatarUrl,
  initial,
  initialName,
  initialDiscord,
}: {
  email: string | null;
  avatarUrl: string | null;
  initial: string;
  initialName: string;
  initialDiscord: string;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialName);
  const [discord, setDiscord] = useState(initialDiscord);

  return (
    <div className="space-y-5">
      <AvatarUpload layout="row" avatarUrl={avatarUrl} initial={initial} />

      <div className="border-t" />

      <form
        className="space-y-4"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="account-email"
              className="text-muted-foreground block text-xs font-medium"
            >
              Email
            </label>
            <Input
              id="account-email"
              value={email ?? ""}
              readOnly
              disabled
              placeholder="No session"
              className="h-9 text-sm"
            />
            <p className="text-faint text-[11px]">Email cannot be changed.</p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="account-name"
              className="text-muted-foreground block text-xs font-medium"
            >
              Display name
            </label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How you appear in the app"
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="account-discord"
            className="text-muted-foreground block text-xs font-medium"
          >
            Discord handle
          </label>
          <Input
            id="account-discord"
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            placeholder="e.g. daniel — DM notifications wire in with integrations"
            className="h-9 text-sm sm:max-w-sm"
          />
        </div>

        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}
