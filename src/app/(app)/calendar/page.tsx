import { PageHeader } from "@/components/shell/page-header";
import { CalendarView } from "@/components/calendar/calendar-view";
import { stepMonth } from "@/lib/calendar/month-grid";
import {
  listCalendarBookings,
  listCalendarFeedEvents,
  listCalendarItems,
} from "@/lib/calendar/queries";
import { loadRoster } from "@/lib/roster-server";
import { dayKeyIn } from "@/lib/time/zone";
import { viewerTimeZone } from "@/lib/time/viewer-zone";

export const metadata = { title: "Calendar - GV OS" };
export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");

export default async function CalendarPage() {
  const tz = await viewerTimeZone();
  const todayKey = dayKeyIn(new Date(), tz);
  const [ty, tm] = todayKey.split("-").map(Number);

  // Hand the client a wide window (this month ±6 months) so paging between
  // months is instant, in-browser state — no per-click server round-trip.
  const from = stepMonth(ty, tm, -6);
  const to = stepMonth(ty, tm, 6);
  const fromKey = `${from.year}-${pad(from.month)}-01`;
  const lastDay = new Date(Date.UTC(to.year, to.month, 0)).getUTCDate();
  const toKey = `${to.year}-${pad(to.month)}-${pad(lastDay)}`;

  // Booked calls come from the schedulers already syncing (iClosed,
  // Calendly); a Google Calendar feed adds meetings only if one is connected.
  const [items, calls, meetings] = await Promise.all([
    listCalendarItems(fromKey, toKey),
    listCalendarBookings(fromKey, toKey, tz),
    listCalendarFeedEvents(fromKey, toKey),
  ]);
  const events = [...calls, ...meetings].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const accents = Object.fromEntries(
    (await loadRoster()).map((c) => [c.slug, c.accent]),
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader title="The" highlight="calendar." />
      <CalendarView
        items={items}
        events={events}
        todayKey={todayKey}
        accents={accents}
      />
    </div>
  );
}
