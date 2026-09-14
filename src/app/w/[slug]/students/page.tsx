import { GraduationCap } from "lucide-react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { StudentsBoardView } from "@/components/students/students-board";
import { FeedFreshness } from "@/components/tracking/feed-freshness";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi } from "@/components/ui/metric";
import { WsPageHeader } from "@/components/workspace/ws-page-header";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { viewerRole } from "@/lib/auth/viewer";
import {
  isPortalView,
  portalShows,
  portalVisibility,
} from "@/lib/clients/portal-visibility";
import { cents, formatUSD } from "@/lib/money";
import { rosterClientBySlug } from "@/lib/roster-server";
import { loadStudentsBoard } from "@/lib/students/loader";
import { snapshotFreshness } from "@/lib/tracking/freshness";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  return { title: client ? `${client.name} Students - GV OS` : "Students - GV OS" };
}

/**
 * Students — every buyer on this offer, boarded by weeks since their first
 * payment. Fulfilment works on time since purchase, so this is the view a
 * delivery team runs from: who is in week one and needs onboarding, who hits
 * the first-month check-in, who is past the first quarter.
 *
 * Buyers come from the offer's dashboard payment feed (tag rules applied), so
 * a student here is exactly a payer on the dashboard. The page is visible in a
 * client's portal — it is their customer list — but money on the cards follows
 * the same cash visibility toggle as every other portal surface.
 */
export default async function WorkspaceStudentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);

  const now = new Date();
  const [data, cookiePortal, role, visibility] = await Promise.all([
    row ? loadStudentsBoard(row.id, now) : Promise.resolve(null),
    isPortalView(),
    viewerRole(),
    portalVisibility(slug),
  ]);
  // A real client login is portal view too, not only the admin's preview cookie.
  const portalView = cookiePortal || role === "client";
  const showCash = portalShows(portalView, visibility, "cash", false);

  const header = (aside?: React.ReactNode) => (
    <WsPageHeader
      icon={GraduationCap}
      title="Students"
      lede="Everyone who bought, boarded by how long ago they started — week one needs onboarding, week four needs a check-in, month three is where renewals and refunds get decided."
      aside={aside}
    />
  );

  if (!data || !data.source) {
    return (
      <div className="space-y-6">
        {header()}
        <EmptyState
          icon={GraduationCap}
          title="No payments to build students from yet"
          explainer={`Students appear as soon as ${client.name}'s payment processor or tracking sheet supplies collected payments. Each buyer gets a card in the week they first paid.`}
        />
      </div>
    );
  }

  const { summary, board, columns, program } = data;
  return (
    <div className="space-y-6">
      {header(<FeedFreshness freshness={snapshotFreshness(data.syncedAt, now)} />)}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          variant="tile"
          label="Students — all time"
          value={String(summary.total)}
          tone="brand"
        />
        <Kpi
          variant="tile"
          label="In their first month"
          value={String(summary.firstMonth)}
        />
        {program.lengthWeeks !== null ? (
          <Kpi
            variant="tile"
            label={`Completed the ${program.lengthWeeks}-week program`}
            value={String(summary.complete)}
          />
        ) : (
          <Kpi
            variant="tile"
            label="Refunded in full"
            value={String(summary.refunded)}
          />
        )}
        <Kpi
          variant="tile"
          label="Paid, net of refunds — all time"
          value={showCash ? formatUSD(cents(summary.netCents)) : "—"}
        />
      </div>

      {summary.total === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No students yet"
          explainer="The payment feed is connected but holds no collected, dated payments yet."
        />
      ) : (
        <StudentsBoardView slug={slug} columns={columns} showCash={showCash} />
      )}

      <p className="text-faint text-xs">
        From the {data.source === "stripe" ? "Stripe" : "tracking sheet"} payment feed,
        after this offer&apos;s payment tag rules. A week is counted from each
        buyer&apos;s first collected payment; refunds subtract; failed charges never
        make anyone a student.
        {program.minPaymentCents !== null &&
          ` A student is anyone with a single payment of ${formatUSD(cents(program.minPaymentCents))} or more; their week counts from that payment.`}
        {board.belowMinimumPayers > 0 &&
          ` ${board.belowMinimumPayers} payer${board.belowMinimumPayers === 1 ? " hasn't" : "s haven't"} reached that minimum and ${board.belowMinimumPayers === 1 ? "isn't" : "aren't"} shown.`}
        {board.undatedPayers > 0 &&
          ` ${board.undatedPayers} payer${board.undatedPayers === 1 ? " has" : "s have"} money with no date and can't be placed in a week.`}
      </p>
    </div>
  );
}
