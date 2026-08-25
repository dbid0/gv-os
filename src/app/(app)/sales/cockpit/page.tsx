import { sql } from "drizzle-orm";
import { MessagesSquare, PhoneCall, Timer, Users } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Kpi } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { bookings, crmActivity } from "@/db/schema/app";
import { computeFunnel } from "@/lib/sales/funnel";
import { getLeaderboard } from "@/lib/sales/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Sales cockpit - GV OS" };
export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

/**
 * The sales-manager cockpit: the whole funnel, not just closed deals. Set →
 * show → close per rep and for the team, from submitted EOD activity + real
 * deals. The CRM / booked-calls / ManyChat / speed-to-lead tiles light up as
 * those sources connect; until then they say what to connect, never a fake
 * number.
 */
export default async function SalesCockpitPage() {
  const db = getDb();
  const [leaderboard, [{ crm }], [{ booked }]] = await Promise.all([
    getLeaderboard(),
    db.select({ crm: sql<number>`count(*)` }).from(crmActivity),
    db.select({ booked: sql<number>`count(*)` }).from(bookings),
  ]);

  const funnel = computeFunnel(
    leaderboard.map((r) => ({
      repId: r.repId,
      name: r.name,
      teamName: r.teamName,
      setsBooked: r.setsBooked,
      shows: r.shows,
      deals: r.dealsClosed,
    })),
  );

  const crmCount = Number(crm);
  const bookedCount = Number(booked);

  const sources = [
    {
      icon: PhoneCall,
      label: "CRM activity",
      value: crmCount > 0 ? crmCount.toLocaleString("en-US") : null,
      hint: crmCount > 0 ? "calls · sms · emails synced" : "Connect Close",
    },
    {
      icon: Users,
      label: "Booked calls",
      value: bookedCount > 0 ? bookedCount.toLocaleString("en-US") : null,
      hint: bookedCount > 0 ? "from bookings" : "Connect Calendly / iClosed",
    },
    {
      icon: MessagesSquare,
      label: "DM → booked",
      value: null,
      hint: "Connect ManyChat",
    },
    {
      icon: Timer,
      label: "Speed to lead",
      value: null,
      hint: "Connect Close",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Sales"
        highlight="cockpit."
        description="The manager's funnel — set → show → close per rep, from submitted EODs and real deals. Sources light up as they connect."
        status={
          <StatusPill tone={funnel.reps.length ? "live" : "muted"}>
            {funnel.reps.length} active {funnel.reps.length === 1 ? "rep" : "reps"}
          </StatusPill>
        }
      />

      {/* The funnel headline: three stages with the conversion between them. */}
      <Panel title="Team funnel">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stage label="Sets booked" value={funnel.setsBooked} tone="brand" />
          <Stage
            label="Shows"
            value={funnel.shows}
            rate={`${pct(funnel.showRatePct)} show rate`}
          />
          <Stage
            label="Deals closed"
            value={funnel.deals}
            rate={`${pct(funnel.closeRatePct)} close rate`}
            tone="success"
          />
        </div>
        <p className="text-faint mt-3 text-xs">
          Set-to-close:{" "}
          <span className="text-foreground">{pct(funnel.setToCloseRatePct)}</span> of
          booked sets become deals.
        </p>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sources.map((s) => (
          <Kpi
            key={s.label}
            label={s.label}
            icon={s.icon}
            tone={s.value ? "brand" : "default"}
            value={
              s.value ? (
                s.value
              ) : (
                <span className="text-faint text-sm font-normal">{s.hint}</span>
              )
            }
          />
        ))}
      </div>

      <Panel title="Rep funnel" padded={false}>
        {funnel.reps.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            No funnel activity yet — it fills as reps submit EODs and close deals.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-xs">
                  <th className="px-4 py-2 font-medium">Rep</th>
                  <th className="py-2 pr-3 text-right font-medium">Sets</th>
                  <th className="py-2 pr-3 text-right font-medium">Shows</th>
                  <th className="py-2 pr-3 text-right font-medium">Show %</th>
                  <th className="py-2 pr-3 text-right font-medium">Deals</th>
                  <th className="py-2 pr-4 text-right font-medium">Close %</th>
                </tr>
              </thead>
              <tbody>
                {funnel.reps.map((r) => (
                  <tr key={r.repId} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <span className="block font-medium">{r.name}</span>
                      {r.teamName && (
                        <span className="text-muted-foreground block text-xs">
                          {r.teamName}
                        </span>
                      )}
                    </td>
                    <td className="numeric py-2 pr-3 text-right tabular-nums">
                      {r.setsBooked}
                    </td>
                    <td className="numeric py-2 pr-3 text-right tabular-nums">
                      {r.shows}
                    </td>
                    <td className="numeric text-muted-foreground py-2 pr-3 text-right tabular-nums">
                      {pct(r.showRatePct)}
                    </td>
                    <td className="numeric py-2 pr-3 text-right font-medium tabular-nums">
                      {r.deals}
                    </td>
                    <td
                      className={cn(
                        "numeric py-2 pr-4 text-right font-medium tabular-nums",
                        r.closeRatePct !== null && r.closeRatePct >= 30
                          ? "text-success"
                          : "",
                      )}
                    >
                      {pct(r.closeRatePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Stage({
  label,
  value,
  rate,
  tone,
}: {
  label: string;
  value: number;
  rate?: string;
  tone?: "brand" | "success";
}) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p
        className={cn(
          "numeric mt-1 text-3xl font-bold tabular-nums",
          tone === "brand" && "text-brand",
          tone === "success" && "text-success",
        )}
      >
        {value.toLocaleString("en-US")}
      </p>
      {rate && <p className="text-faint mt-0.5 text-xs">{rate}</p>}
    </div>
  );
}
