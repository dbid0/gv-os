import { TeamBoardHome } from "@/components/home/team-board-home";
import { WingmanHome } from "@/components/home/wingman-home";
import { shellUser } from "@/lib/auth/user";
import { getRepForEmail, listRepMomentum } from "@/lib/gamification/queries";
import { listTeamMembers } from "@/lib/team";
import { selectHomeIdentity } from "@/lib/home/identity";
import { getWingmanData } from "@/lib/home/data";

export const metadata = { title: "Your Board - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The Team Member home ("Wingman"): the signed-in rep's own day — quota pace,
 * streak and personal bests, commission owed, recent activity, and quick actions
 * to log a call or file an EOD. No accounting.
 *
 * A member who is not (yet) a linked sales rep — a copywriter, a VA, or an admin
 * browsing — sees the team board (roster + rep momentum) instead of a wall of
 * empty rep numbers, with an honest note that their own board appears once their
 * account is linked to a rep.
 */
export default async function MemberHomePage() {
  const now = new Date();
  const user = await shellUser();
  const members = await listTeamMembers();
  const identity = selectHomeIdentity(members, user?.email ?? null);

  // The rep link from the roster, or the fallback for a rep linked only through
  // their profile (reps.profile_id) with no roster row pointing at them.
  const repId =
    identity.repId ??
    (user?.email ? ((await getRepForEmail(user.email))?.id ?? null) : null);

  if (repId) {
    const data = await getWingmanData(repId, now.getTime());
    return <WingmanHome data={data} />;
  }

  const momentum = await listRepMomentum();
  const roster = members
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.id, name: m.name, role: m.role }));

  return (
    <TeamBoardHome
      members={roster}
      momentum={momentum}
      notARep={Boolean(user?.email)}
    />
  );
}
