import { CoachHome } from "@/components/home/coach-home";
import { WingmanHome } from "@/components/home/wingman-home";
import { shellUser } from "@/lib/auth/user";
import { listTeamMembers } from "@/lib/team";
import { listTeams } from "@/lib/sales/queries";
import { managedClientIds, selectHomeIdentity } from "@/lib/home/identity";
import { getCoachData, getWingmanData } from "@/lib/home/data";

export const metadata = { title: "Manager Home - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The Sales Manager home ("Coach"): the managed offers' sales world — cash and
 * deals this month, quota pacing, EOD compliance, close/show-rate trend, and the
 * top and bottom rep. Deliberately zero accounting.
 *
 * The middleware routes both managers and reps here (a rep's route home is
 * /home/manager), so the page is viewer-aware: it resolves the signed-in person
 * from the Team roster and shows a rep their own Wingman board while a manager
 * or admin gets the Coach dashboard scoped to their offers.
 */
export default async function ManagerHomePage() {
  // One clock for the whole read — Date.now() is banned in server components.
  const now = new Date();
  const user = await shellUser();
  const members = await listTeamMembers();
  const identity = selectHomeIdentity(members, user?.email ?? null);

  // A rep routes here too; their home is their own board, not the floor's.
  if (identity.platformRole === "sales_rep" && identity.repId) {
    const data = await getWingmanData(identity.repId, now.getTime());
    return <WingmanHome data={data} />;
  }

  // Manager / admin / unmapped owner → the Coach dashboard, scoped to the offers
  // they run (a manager's one lane, or every offer for agency-wide and admins).
  const teams = await listTeams();
  const scopeIds = managedClientIds(
    identity,
    teams.map((t) => t.id),
  );
  const isAllOffers =
    identity.platformRole !== "sales_manager" || identity.managerClientId === null;
  const scopeLabel = isAllOffers
    ? "All offers"
    : (teams.find((t) => t.id === identity.managerClientId)?.name ?? "Your offer");

  const model = await getCoachData({
    scopeClientIds: scopeIds,
    isAllOffers,
    scopeLabel,
    nowMs: now.getTime(),
  });

  return <CoachHome model={model} viewerName={user?.name ?? ""} />;
}
