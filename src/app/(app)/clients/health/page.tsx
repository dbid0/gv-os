import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { Kpi } from "@/components/ui/metric";
import { buttonVariants } from "@/components/ui/button";
import { getClientHealthData } from "@/lib/clients/health-data";
import { clientLogos } from "@/lib/clients/logos";
import { cn } from "@/lib/utils";

export const metadata = { title: "Client health - GV OS" };
export const dynamic = "force-dynamic";

const BAND_TONE: Record<string, StatusTone> = {
  healthy: "live",
  watch: "progress",
  at_risk: "danger",
};
const BAND_LABEL: Record<string, string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At risk",
};

export default async function ClientHealthPage() {
  const [rows, logos] = await Promise.all([getClientHealthData(), clientLogos()]);
  const atRisk = rows.filter((r) => r.health.band === "at_risk").length;
  const watch = rows.filter((r) => r.health.band === "watch").length;
  const healthy = rows.filter((r) => r.health.band === "healthy").length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Client"
        highlight="health."
        description="One score per offer — is cash growing, is the funnel feeding, is the team active. Worst first, so a client drifting toward churn surfaces before it's too late."
        status={
          <StatusPill tone={atRisk ? "danger" : "live"}>{atRisk} at risk</StatusPill>
        }
        actions={
          <Link
            href="/clients"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> All clients
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Healthy" value={String(healthy)} tone="success" />
        <Kpi label="Watch" value={String(watch)} tone="warning" />
        <Kpi
          label="At risk"
          value={String(atRisk)}
          tone={atRisk ? "danger" : "default"}
        />
      </div>

      {rows.length === 0 ? (
        <Panel title="No offers yet">
          <p className="text-faint py-8 text-center text-sm">
            Client health appears here once offers have cash, applications, or rep
            activity flowing.
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.slug}
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center",
                r.health.band === "at_risk"
                  ? "border-danger/30 bg-danger/5"
                  : "bg-card",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {logos[r.slug] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL
                  <img
                    src={logos[r.slug]}
                    alt=""
                    className="size-10 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-lg border text-sm font-bold"
                    style={{
                      color: r.accent,
                      borderColor: `${r.accent}55`,
                      background: `${r.accent}14`,
                    }}
                  >
                    {r.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {r.name}
                    <StatusPill tone={BAND_TONE[r.health.band]}>
                      {BAND_LABEL[r.health.band]}
                    </StatusPill>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.health.factors.map((f) => (
                      <span
                        key={f.key}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                          f.ok
                            ? "text-muted-foreground"
                            : "border-warning/40 text-warning",
                        )}
                      >
                        {f.ok ? <Check className="size-3" /> : <X className="size-3" />}
                        {f.label}: {f.detail}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-4">
                <div className="text-right">
                  <p
                    className={cn(
                      "numeric text-2xl font-bold tabular-nums",
                      r.health.band === "at_risk"
                        ? "text-destructive"
                        : r.health.band === "watch"
                          ? "text-warning"
                          : "text-success",
                    )}
                  >
                    {r.health.score}
                  </p>
                  <p className="text-faint text-[10px] tracking-wider uppercase">
                    / 100
                  </p>
                </div>
                <Link
                  href={`/clients/${r.slug}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1.5",
                  )}
                >
                  Open <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
