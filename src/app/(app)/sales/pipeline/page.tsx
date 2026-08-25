import { desc } from "drizzle-orm";

import { PipelineBoard } from "@/components/sales/pipeline-board";
import { PageHeader } from "@/components/shell/page-header";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { pipelineProspects } from "@/db/schema/app";
import { cents } from "@/lib/money";
import { pipelineForecast } from "@/lib/pipeline/forecast";

export const metadata = { title: "Pipeline - GV OS" };
export const dynamic = "force-dynamic";

/**
 * GV's own sales pipeline — the agency's prospects (creators it's selling into)
 * from lead to signed, with a setup + rev-share forecast. Deliberately separate
 * from the money ledger: this is what MIGHT close, not what has.
 */
export default async function PipelinePage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(pipelineProspects)
    .orderBy(desc(pipelineProspects.updatedAt));

  const forecast = pipelineForecast(rows);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Pipeline"
        highlight="."
        description="GV's own sales — prospects from lead to signed, with the setup + rev-share each would add. Forecast, not the ledger."
        status={
          <StatusPill tone={forecast.openCount ? "live" : "muted"}>
            {forecast.openCount} open · {forecast.wonCount} won
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Open setup value"
          value={<Money amount={cents(forecast.openSetupCents)} />}
          tone="brand"
        />
        <Kpi
          label="Open rev-share / mo"
          value={<Money amount={cents(forecast.openMonthlyCents)} />}
        />
        <Kpi
          label="Weighted setup"
          value={<Money amount={cents(forecast.weightedSetupCents)} />}
          tone="success"
        />
        <Kpi
          label="Weighted rev-share / mo"
          value={<Money amount={cents(forecast.weightedMonthlyCents)} />}
          tone="success"
        />
      </div>

      <PipelineBoard prospects={rows} />
    </div>
  );
}
