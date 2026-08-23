import Link from "next/link";
import { Settings } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { ProfileForm } from "@/components/settings/profile-form";
import { shellUser } from "@/lib/auth/user";
import { getPref } from "@/lib/prefs";
import { cn } from "@/lib/utils";

export const metadata = { title: "Profile - GV OS" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await shellUser();
  const [displayName, discordHandle, avatarUrl] = await Promise.all([
    getPref<string>(user?.email ?? null, "display-name"),
    getPref<string>(user?.email ?? null, "discord-handle"),
    getPref<string>(user?.email ?? null, "avatar"),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm">Your GV OS account.</p>
      </div>

      <Panel title="Account">
        <div className="flex items-center gap-4">
          <Avatar className="size-12">
            <AvatarFallback className="text-base">
              {user?.initial ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium">{user?.name ?? "Build mode"}</p>
            <p className="text-muted-foreground truncate text-xs">
              {user?.email ?? "No session — auth is off during the build phase"}
            </p>
          </div>
          <div className="ml-auto shrink-0">
            <StatusPill tone={user ? "live" : "muted"}>
              {user ? "Signed in" : "No session"}
            </StatusPill>
          </div>
        </div>

        <div className="mt-5 border-t pt-4">
          <Link
            href="/settings"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <Settings className="size-3.5" /> Org settings
          </Link>
        </div>
      </Panel>
      <AvatarUpload avatarUrl={avatarUrl} initial={user?.initial ?? "?"} />
      <ProfileForm
        initialName={displayName ?? ""}
        initialDiscord={discordHandle ?? ""}
      />
    </div>
  );
}
