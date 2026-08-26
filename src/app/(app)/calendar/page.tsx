import { PageHeader } from "@/components/shell/page-header";
import { CalendarView } from "@/components/calendar/calendar-view";
import { dayKeyCT } from "@/lib/charts";
import { stepMonth } from "@/lib/calendar/month-grid";
import { listCalendarItems, listUnscheduledItems } from "@/lib/calendar/queries";

export const metadata = { title: "Calendar - GV OS" };
export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");

export default async function CalendarPage() {
  const todayKey = dayKeyCT(new Date());
  const [ty, tm] = todayKey.split("-").map(Number);

  // Hand the client a wide window (this month ±6 months) so paging between
  // months is instant, in-browser state — no per-click server round-trip.
  const from = stepMonth(ty, tm, -6);
  const to = stepMonth(ty, tm, 6);
  const fromKey = `${from.year}-${pad(from.month)}-01`;
  const lastDay = new Date(Date.UTC(to.year, to.month, 0)).getUTCDate();
  const toKey = `${to.year}-${pad(to.month)}-${pad(lastDay)}`;

  const [items, unscheduled] = await Promise.all([
    listCalendarItems(fromKey, toKey),
    listUnscheduledItems(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Calendar"
        description="Tasks and action items across every offer, on the month they're due. Items land here from the agency task board and each offer's board."
      />
      <CalendarView items={items} unscheduled={unscheduled} todayKey={todayKey} />
    </div>
  );
}
