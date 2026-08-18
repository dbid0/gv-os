import { SectionScaffold } from "@/components/sales/section-scaffold";

export const metadata = {
  title: "Leaderboard - GV OS",
};

export default function SalesLeaderboardPage() {
  return (
    <SectionScaffold
      title="Leaderboard"
      waitingOn="EOD activity"
      columns={["Rep", "Role", "Dials", "Sets", "Shows", "Closes", "Close %"]}
      emptyTitle="No activity yet"
      emptyDetail="Rep rankings across dials, sets, shows, and closes will appear once EOD reports flow in from Operations. Filter by role to compare setters against setters, closers against closers."
    />
  );
}
