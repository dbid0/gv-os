import Link from "next/link";
import { ArrowRight, Settings } from "lucide-react";

import { ActivityHeatmap } from "@/components/gamification/activity-heatmap";
import { PbCountBadge } from "@/components/gamification/personal-bests";
import { StreakBadge } from "@/components/gamification/streak-badge";
import { buttonVariants } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { ProfileForm } from "@/components/settings/profile-form";
import { shellUser } from "@/lib/auth/user";
import { getRepForEmail, getRepGamification } from "@/lib/gamification/queries";
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

  // Momentum is a rep-level thing, so it only appears when this account is
  // linked to an active sales rep. No session or no link = an honest empty card.
  const rep = user?.email ? await getRepForEmail(user.email) : null;
  const momentum = rep ? await getRepGamification(rep.id) : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm">Your GV OS account.</p>
      </div>

      <Panel title="Account">
        <div className="flex flex-wrap items-center gap-4">
          <AvatarUpload avatarUrl={avatarUrl} initial={user?.initial ?? "?"} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium">{user?.name ?? "Build mode"}</p>
            <p className="text-muted-foreground truncate text-xs">
              {user?.email ?? "No session — auth is off during the build phase"}
            </p>
            <p className="text-faint mt-0.5 text-[11px]">
              Click the picture to change it
            </p>
          </div>
          <StatusPill tone={user ? "live" : "muted"}>
            {user ? "Signed in" : "No session"}
          </StatusPill>
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
      <Panel
        title="Your momentum"
        aside={
          momentum?.gamification.hasActivity ? (
            <div className="flex items-center gap-2">
              <StreakBadge days={momentum.gamification.streak.current} />
              <PbCountBadge count={momentum.gamification.personalBests.length} />
            </div>
          ) : undefined
        }
      >
        {!momentum ? (
          <p className="text-faint py-6 text-center text-sm">
            {user
              ? "This account isn't linked to a sales rep yet — momentum shows up once it is."
              : "No session — sign in to see your streak, personal bests, and heatmap."}
          </p>
        ) : !momentum.gamification.hasActivity ? (
          <p className="text-faint py-6 text-center text-sm">
            No activity yet. Log a call, file an EOD, or close a deal and your streak
            starts here.
          </p>
        ) : (
          <div className="space-y-4">
            <ActivityHeatmap heatmap={momentum.gamification.heatmap} />
            <Link
              href={`/home/member/${rep?.id}`}
              className="text-brand inline-flex items-center gap-1.5 text-sm"
            >
              View full momentum <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
      </Panel>
      <ProfileForm
        initialName={displayName ?? ""}
        initialDiscord={discordHandle ?? ""}
      />
    </div>
  );
}
