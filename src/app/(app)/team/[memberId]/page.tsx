import { notFound } from "next/navigation";

import { MemberBoard } from "@/components/team/member-board";
import { getTeamMember, listActiveMembers } from "@/lib/team";

export const metadata = { title: "Member profile - GV OS" };
export const dynamic = "force-dynamic";

export default async function MemberBoardPage(props: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(memberId)) notFound();
  const [member, members] = await Promise.all([
    getTeamMember(memberId),
    listActiveMembers(),
  ]);
  if (!member) notFound();
  return <MemberBoard member={member} members={members} />;
}
