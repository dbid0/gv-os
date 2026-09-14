import Link from "next/link";
import { Activity, ArrowRight, LogOut, ShieldCheck, User } from "lucide-react";

import { ActivityHeatmap } from "@/components/gamification/activity-heatmap";
import { PbCountBadge } from "@/components/gamification/personal-bests";
import { StreakBadge } from "@/components/gamification/streak-badge";
import { AccountNav } from "@/components/settings/account-nav";
import { AccountProfileCard } from "@/components/settings/account-profile-card";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status";
import { signOut } from "@/lib/auth/actions";
import { shellUser } from "@/lib/auth/user";
import { getRepForEmail, getRepGamification } from "@/lib/gamification/queries";
import { getPref } from "@/lib/prefs";

export const metadata = { title: "Account Settings - GV OS" };
export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { id: "profile", label: "Profile" },
  { id: "momentum", label: "Momentum" },
  { id: "security", label: "Security" },
];

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
    <div className="mx-auto w-full max-w-4xl pb-12">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold tracking-tight">Account Settings</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Your GV OS account — profile, momentum, and sign-in.
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[180px_1fr] lg:items-start">
        <AccountNav items={NAV_ITEMS} />

        <div className="space-y-6">
          <div id="profile" className="scroll-mt-6">
            <SettingsSection
              icon={User}
              title="Profile"
              description="Your photo and name as they appear across GV OS."
              aside={
                <StatusPill tone={user ? "live" : "muted"}>
                  {user ? "Signed in" : "No session"}
                </StatusPill>
              }
            >
              <AccountProfileCard
                email={user?.email ?? null}
                avatarUrl={avatarUrl}
                initial={user?.initial ?? "?"}
                initialName={displayName ?? ""}
                initialDiscord={discordHandle ?? ""}
              />
            </SettingsSection>
          </div>

          <div id="momentum" className="scroll-mt-6">
            <SettingsSection
              icon={Activity}
              title="Momentum"
              description="Your streak, personal bests, and activity heatmap when this account is linked to a sales rep."
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
                  No activity yet. Log a call, file an EOD, or close a deal and your
                  streak starts here.
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
            </SettingsSection>
          </div>

          <div id="security" className="scroll-mt-6">
            <SettingsSection
              icon={ShieldCheck}
              title="Security"
              description="How you sign in, and how to sign out of this device."
            >
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium">Sign-in method</p>
                  <p className="text-muted-foreground mt-1 max-w-prose text-sm">
                    Sign-in is a magic link to your allowlisted email — there is no
                    password to reset by design. Changing the email means changing the
                    allowlist.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div>
                    <p className="text-sm font-medium">Your session</p>
                    <p className="text-muted-foreground text-sm">
                      Sign out of GV OS on this device.
                    </p>
                  </div>
                  <form action={signOut}>
                    <Button
                      type="submit"
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                    >
                      <LogOut className="size-3.5" /> Sign Out
                    </Button>
                  </form>
                </div>
              </div>
            </SettingsSection>

            <p className="text-faint mt-4 text-xs">
              Looking for the agency&apos;s settings?{" "}
              <Link href="/settings" className="text-brand hover:underline">
                Org settings
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
