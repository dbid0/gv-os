import Link from "next/link";
import { CircleCheck, ListChecks, Plug, Scale, TriangleAlert } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import type { MorningGlance as Glance } from "@/lib/dashboard";
import { providerByValue } from "@/lib/integrations/providers";

/**
 * The "what needs attention" strip at the top of the dashboard — server
 * rendered, pure reads. Each block links to the screen where the work
 * happens; this is a glance, not a destination.
 */

const fmtWhen = (d: Date | null) =>
  d
    ? new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Chicago",
      })
    : "never";

export function MorningGlance({ glance }: { glance: Glance }) {
  const staleCount = glance.integrations.filter((i) => i.stale).length;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="The numbers">
        <Link href="/accounting/reconciliation" className="block space-y-2">
          {glance.sheet ? (
            <>
              <div className="flex items-center gap-2">
                {glance.sheet.driftRowCount === 0 ? (
                  <StatusPill tone="live">Sheet in agreement</StatusPill>
                ) : (
                  <StatusPill tone="danger">
                    {glance.sheet.driftRowCount} rows drift · $
                    {(glance.sheet.totalAbsDriftCents / 100).toFixed(2)}
                  </StatusPill>
                )}
              </div>
              <p className="text-faint text-xs">
                <Scale className="mr-1 inline size-3" />
                Last reconciled {fmtWhen(glance.sheet.lastRunAt)} · checks itself daily
                at 6am CT
              </p>
            </>
          ) : (
            <p className="text-faint text-sm">No reconciliation run yet.</p>
          )}
        </Link>
      </Panel>

      <Panel title="Today's actions">
        <Link href="/action-list" className="block space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold tabular-nums">
              {glance.actions.open}
            </span>
            <span className="text-muted-foreground text-sm">
              open
              {glance.actions.dueToday > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-warning">
                    {glance.actions.dueToday} due today
                  </span>
                </>
              )}
            </span>
          </div>
          {glance.actions.byMember.length > 0 ? (
            <p className="text-faint text-xs">
              <ListChecks className="mr-1 inline size-3" />
              {glance.actions.byMember
                .map((m) => `${m.name.split(" ")[0]} ${m.open}`)
                .join(" · ")}
            </p>
          ) : (
            <p className="text-faint text-xs">
              Nothing assigned yet — add the roster under Team.
            </p>
          )}
        </Link>
      </Panel>

      <Panel title="Integrations">
        <Link href="/settings/integrations" className="block space-y-2">
          <div className="flex items-center gap-2">
            {staleCount === 0 ? (
              <StatusPill tone={glance.integrations.length ? "live" : "muted"}>
                {glance.integrations.length} connected
                {glance.integrations.length > 0 && " · all fresh"}
              </StatusPill>
            ) : (
              <StatusPill tone="danger">{staleCount} stale</StatusPill>
            )}
          </div>
          <p className="text-faint text-xs">
            <Plug className="mr-1 inline size-3" />
            {glance.captures.paymentsTotal} payments · {glance.captures.crmTotal} CRM
            activities · {glance.captures.kitAccounts} Kit accounts captured
            {glance.captures.payments24h + glance.captures.crm24h > 0 && (
              <> ({glance.captures.payments24h + glance.captures.crm24h} in 24h)</>
            )}
          </p>
        </Link>
      </Panel>

      {glance.integrations.length > 0 && (
        <div className="lg:col-span-3">
          <div className="flex flex-wrap gap-2">
            {glance.integrations.map((i) => (
              <span
                key={`${i.provider}-${i.label}`}
                className="text-faint inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
                title={i.lastSyncNote ?? undefined}
              >
                {i.stale ? (
                  <TriangleAlert className="text-warning size-3" />
                ) : (
                  <CircleCheck className="text-success size-3" />
                )}
                {providerByValue(i.provider)?.label ?? i.provider}
                {i.clientName && (
                  <span className="text-muted-foreground">· {i.clientName}</span>
                )}
                <span>· {fmtWhen(i.lastSyncAt)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
