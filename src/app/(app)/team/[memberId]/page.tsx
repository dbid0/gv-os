import { notFound } from "next/navigation";

import { MemberBoard } from "@/components/team/member-board";
import { getMemberProfile, listActiveMembers, listLinkableReps } from "@/lib/team";

export const metadata = { title: "Member profile - GV OS" };
export const dynamic = "force-dynamic";

export default async function MemberBoardPage(props: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(memberId)) notFound();

  // One clock for the whole read — Date.now() is banned in server components.
  const now = new Date();
  const profile = await getMemberProfile(memberId, now.getTime());
  if (!profile) notFound();

  // Only offer the link control when the member has no rep yet.
  const [members, linkableReps] = await Promise.all([
    listActiveMembers(),
    profile.rep ? Promise.resolve([]) : listLinkableReps(profile.member.clientId),
  ]);

  return (
    <MemberBoard
      profile={profile}
      members={members}
      linkableReps={linkableReps}
      nowMs={now.getTime()}
    />
  );
}
