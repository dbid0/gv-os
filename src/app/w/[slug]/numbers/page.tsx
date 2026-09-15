import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Hash } from "lucide-react";

import {
  countOf,
  NumberSection,
  NumberTile,
  PartsBar,
  pctOf,
  usdOf,
} from "@/components/tracking/number-tiles";
import { EmptyState } from "@/components/ui/empty-state";
import { WindowChips } from "@/components/ui/window-chips";
import { WsPageHeader } from "@/components/workspace/ws-page-header";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { viewerRole } from "@/lib/auth/viewer";
import { CashSection } from "@/components/tracking/cash-section";
import { DialingSection } from "@/components/tracking/dialing-section";
import { loadCallLog } from "@/lib/calls/call-log-loader";
import { loadDialing } from "@/lib/crm/dialing-loader";
import { loadCashCatalog } from "@/lib/tracking/cash-catalog-loader";
import { callScoreboard } from "@/lib/calls/call-scoreboard";
import { isPortalView } from "@/lib/clients/portal-visibility";
import { rosterClientBySlug } from "@/lib/roster-server";
import { viewerTimeZone } from "@/lib/time/viewer-zone";
import { dayKeyIn } from "@/lib/time/zone";
import {
  isBounded,
  readReportRange,
  reportBounds,
  type ReportRange,
} from "@/lib/tracking/report-window";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  return { title: client ? `${client.name} Numbers - GV OS` : "Numbers - GV OS" };
}

const of = (n: number, what: string) => `of ${n.toLocaleString("en-US")} ${what}`;

/**
 * Numbers — every figure this offer has, each tile over its own denominator,
 * in one window. The reference product's metric catalog, on GV OS's one
 * per-call model: the numbers here are counts over the same rows as the Calls
 * page, so they can't disagree with it.
 *
 * GV's operating read — not a client portal page (same gate as Calls).
 */
export default async function WorkspaceNumbersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tz = await viewerTimeZone();
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();
  const [cookiePortal, role, sp] = await Promise.all([
    isPortalView(),
    viewerRole(),
    searchParams,
  ]);
  if (cookiePortal || role === "client") notFound();

  const range = readReportRange(sp.range);
  const now = new Date();
  const todayKey = dayKeyIn(now, tz);
  const bounds = reportBounds(range, todayKey);
  const hrefFor = (r: ReportRange) =>
    r === "life" ? `/w/${slug}/numbers` : `/w/${slug}/numbers?range=${r}`;

  const header = (
    <WsPageHeader
      icon={Hash}
      title="Numbers"
      lede="Every number this offer has, each over the count it was measured against: cash, booked calls, confirmations, verdicts, how closes paid, the money closers reported, and what the dialler recorded."
      aside={<WindowChips active={range} hrefFor={hrefFor} />}
    />
  );

  const [row] = await getDb()
    .select({ id: clients.id, countedCallSources: clients.countedCallSources })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  if (!row) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Hash}
          title="No client record yet"
          explainer={`${client.name} needs its client record before its numbers can be read.`}
        />
      </div>
    );
  }

  const [{ log, totalBookings }, dialing, cash] = await Promise.all([
    loadCallLog(row.id, row.countedCallSources ?? null, now),
    loadDialing(row.id, bounds, tz),
    loadCashCatalog(row.id, bounds, todayKey, tz),
  ]);
  const s = callScoreboard(log, bounds, tz);

  if (totalBookings === 0) {
    return (
      <div className="space-y-8">
        {header}
        <CashSection data={cash} />
        <EmptyState
          icon={Hash}
          title="No calls on the calendar yet"
          explainer="The call numbers fill in once this offer's calendar (Calendly or iClosed) is connected and booking. End-of-call reports, from the tracking sheet or filed in GV OS, supply the verdicts."
        />
        <DialingSection data={dialing} />
      </div>
    );
  }

  const answered = s.shows + s.noShows;

  return (
    <div className="space-y-8">
      {header}

      {isBounded(bounds) && (
        <p className="text-faint -mt-4 text-xs">
          {bounds.label}, on your calendar: cash by the day it was paid, calls by the
          day they started. Rows with no date only count under All time.
        </p>
      )}

      <CashSection data={cash} />

      <NumberSection
        title="Calls booked"
        lede="Every booking on the counted calendar, and where each one stands."
      >
        <NumberTile label="Booked" value={countOf(s.booked)} sub="bookings" />
        <NumberTile
          label="People booked"
          value={countOf(s.bookedPeople)}
          sub="distinct invitees"
        />
        <NumberTile
          label="Upcoming"
          value={countOf(s.upcoming)}
          sub="start still ahead"
        />
        <NumberTile
          label="Needs an outcome"
          value={countOf(s.needsOutcome)}
          sub="start passed, no report"
          tone={s.needsOutcome > 0 ? "warning" : "default"}
        />
        <NumberTile
          label="Cancelled"
          value={pctOf(s.rates.cancelled)}
          sub={`${countOf(s.cancelled)} ${of(s.booked, "booked")}`}
        />
        <NumberTile
          label="Rescheduled"
          value={countOf(s.rescheduled)}
          sub={of(s.cancelled, "cancelled")}
        />
      </NumberSection>

      <NumberSection
        title="Confirmation"
        lede="A confirmation counts only when it was recorded before the call started."
      >
        <NumberTile
          label="Ever confirmed"
          value={pctOf(s.rates.confirmed)}
          sub={`${countOf(s.everConfirmed)} ${of(s.booked, "booked")}`}
          tone="brand"
        />
        <NumberTile
          label="Confirmed, no verdict yet"
          value={countOf(s.confirmedAwaiting)}
          sub="upcoming or awaiting a report"
        />
        <NumberTile
          label="New calls"
          value={countOf(s.newCalls)}
          sub="never confirmed, no verdict"
        />
        <NumberTile
          label="New, upcoming"
          value={countOf(s.newUpcoming)}
          sub="still time to confirm"
        />
        <NumberTile
          label="New, stuck"
          value={countOf(s.newStuck)}
          sub={`${pctOf(s.rates.newStuck)} ${of(s.booked, "booked")}`}
          tone={s.newStuck > 0 ? "warning" : "default"}
        />
      </NumberSection>

      <NumberSection
        title="Verdicts"
        lede="What the end-of-call reports say. Shows = closes + no-closes + disqualified; a report saying the call was moved or called off sits outside every rate."
        footnote={
          s.needsOutcome > 0
            ? `${countOf(s.needsOutcome)} held ${s.needsOutcome === 1 ? "call has" : "calls have"} no report yet and ${s.needsOutcome === 1 ? "sits" : "sit"} outside these rates until one is filed.`
            : undefined
        }
      >
        <NumberTile
          label="Held"
          value={countOf(s.held)}
          sub="start passed, not cancelled"
        />
        <NumberTile
          label="Show rate"
          value={pctOf(s.rates.show)}
          sub={`${countOf(s.shows)} shows ${of(answered, "with a verdict")}`}
          tone="success"
        />
        <NumberTile
          label="No-show rate"
          value={pctOf(s.rates.noShow)}
          sub={`${countOf(s.noShows)} ${of(answered, "with a verdict")}`}
        />
        <NumberTile
          label="Close rate"
          value={pctOf(s.rates.close)}
          sub={`${countOf(s.closes)} closes ${of(s.shows, "shows")}`}
          tone="success"
        />
        <NumberTile
          label="No-close rate"
          value={pctOf(s.rates.noClose)}
          sub={`${countOf(s.noCloses)} ${of(s.shows, "shows")}`}
        />
        <NumberTile
          label="Disqualified"
          value={pctOf(s.rates.disqualified)}
          sub={`${countOf(s.disqualified)} ${of(s.shows, "shows")}`}
        />
        <NumberTile
          label="Not held"
          value={countOf(s.notHeld)}
          sub="report says moved or called off"
        />
      </NumberSection>

      <section aria-label="How the closes paid" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">How the closes paid</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Read from each close&apos;s close type, or its status words (&ldquo;signed
            up - 2 pay&rdquo;). A close that doesn&apos;t say is untyped, never guessed
            from the money.
          </p>
        </div>
        <div className="card-grad rounded-xl border p-4">
          <PartsBar
            empty="No closes in this window."
            parts={[
              {
                label: "Paid in full",
                value: s.closeKinds.pif,
                className: "bg-success",
              },
              { label: "Split pay", value: s.closeKinds.split, className: "bg-brand" },
              {
                label: "Installments",
                value: s.closeKinds.installments,
                className: "bg-sky-400",
              },
              {
                label: "Deposit",
                value: s.closeKinds.deposit,
                className: "bg-warning",
              },
              {
                label: "Untyped",
                value: s.closeKinds.untyped,
                className: "bg-muted-foreground/50",
              },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberTile
            label="Paid in full"
            value={pctOf(s.rates.pif)}
            sub={`${countOf(s.closeKinds.pif)} ${of(s.closes, "closes")}`}
          />
          <NumberTile
            label="Split pay"
            value={pctOf(s.rates.split)}
            sub={`${countOf(s.closeKinds.split)} ${of(s.closes, "closes")}`}
          />
          <NumberTile
            label="Installments"
            value={pctOf(s.rates.installments)}
            sub={`${countOf(s.closeKinds.installments)} ${of(s.closes, "closes")}`}
          />
          <NumberTile
            label="Deposit"
            value={pctOf(s.rates.deposit)}
            sub={`${countOf(s.closeKinds.deposit)} ${of(s.closes, "closes")}`}
          />
        </div>
      </section>

      <NumberSection
        title="Money reported on the calls"
        lede="What closers wrote on their end-of-call reports. A report is not a payment: the processor's record is on the Dashboard and Accounting."
        footnote="Cash per call taken = reported cash over shows. Average order = reported cash over the distinct people who paid on a call. Still to collect = reported contract value minus reported cash, never below zero."
      >
        <NumberTile
          label="Cash at the call"
          value={usdOf(s.cashAtCallCents)}
          sub={`on ${countOf(s.closes)} closes`}
          tone="success"
        />
        <NumberTile
          label="Contract value"
          value={usdOf(s.revenueAtCallCents)}
          sub="stated on closes"
        />
        <NumberTile
          label="Still to collect"
          value={usdOf(s.leftToCollectCents)}
          sub="contract − cash"
        />
        <NumberTile
          label="Paid on a call"
          value={countOf(s.payersAtCall)}
          sub="distinct people"
        />
        <NumberTile
          label="Average order"
          value={usdOf(s.aovAtCallCents)}
          sub="cash ÷ people who paid"
        />
        <NumberTile
          label="Cash per call taken"
          value={usdOf(s.cashPerCallCents)}
          sub={`cash ÷ ${countOf(s.shows)} shows`}
        />
      </NumberSection>

      <DialingSection data={dialing} />
    </div>
  );
}
