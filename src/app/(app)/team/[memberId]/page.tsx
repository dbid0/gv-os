import { notFound } from "next/navigation";

import { MemberBoard } from "@/components/team/member-board";
import { getTeamMember, listActiveMembers, listMemberActionItems } from "@/lib/team";

export const metadata = { title: "Member board - GV OS" };
export const dynamic = "force-dynamic";

export default async function MemberBoardPage(props: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(memberId)) notFound();
  const [member, items, members] = await Promise.all([
    getTeamMember(memberId),
    listMemberActionItems(memberId),
    listActiveMembers(),
  ]);
  if (!member) notFound();
  return <MemberBoard member={member} items={items} members={members} />;
}
