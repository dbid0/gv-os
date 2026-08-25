import Link from "next/link";

import { CountUpMoney } from "@/components/shell/count-up-money";
import { StatusPill } from "@/components/ui/status";
import { clientBySlug } from "@/lib/roster";
import type { TeamsOverview } from "@/lib/teams-overview";

/**
 * The RepVision "All Teams Overview" header card: the four headline figures in
 * a row, then a per-team cash chip breakdown. Cash and Revenue count up (same
 * feel as the hero); Close% shows an em dash rather than a fake 0% when there
 * is no activity yet. Each chip links into that team's workspace.
 */
export function TeamsOverviewCard({ overview }: { overview: TeamsOverview }) {
  const { cashCents, revenueCents, deals, closeRatePct, teams } = overview;

  return (
    <section className="card-grad elev-card rounded-xl border p-5">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">All teams overview</h2>
        <StatusPill tone={teams.length ? "live" : "muted"}>
          {teams.length} {teams.length === 1 ? "team" : "teams"}
        </StatusPill>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Figure label="Cash collected" tone="text-success">
          <CountUpMoney cents={cashCents} />
        </Figure>
        <Figure label="Revenue">
          <CountUpMoney cents={revenueCents} />
        </Figure>
        <Figure label="Deals closed">{deals.toLocaleString("en-US")}</Figure>
        <Figure label="Close rate">
          {closeRatePct == null ? "—" : `${closeRatePct}%`}
        </Figure>
      </div>

      {teams.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {teams.map((t) => {
            const accent = clientBySlug(t.slug)?.accent ?? "var(--brand)";
            return (
              <Link
                key={t.slug}
                href={`/w/${t.slug}`}
                className="bg-card hover:border-brand/40 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: accent }}
                />
                <span className="font-medium">{t.name}</span>
                <span className="numeric text-muted-foreground tabular-nums">
                  <CountUpMoney cents={t.cashCents} />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Figure({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p
        className={`numeric mt-0.5 text-2xl font-bold tracking-tight tabular-nums ${tone ?? ""}`}
      >
        {children}
      </p>
    </div>
  );
}
