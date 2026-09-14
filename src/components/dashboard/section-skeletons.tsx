import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streaming fallbacks for the dashboard's heavy panels.
 *
 * The headline + KPI tiles paint the instant their (fast) data resolves; each
 * heavy panel below streams in behind its own Suspense boundary. These
 * fallbacks are shaped like the real panels — same frame, same footprint — so
 * nothing jumps when the data arrives and the wait reads as "loading", never
 * "broken". They mirror the shapes in dashboard/loading.tsx.
 */

/** Under the KPI wall: the 13-week "Cash by day" grid. */
export function HeatmapSkeleton() {
  return (
    <Panel title="Cash by day">
      <div className="flex gap-[3px] overflow-hidden">
        {Array.from({ length: 13 }).map((_, col) => (
          <div key={col} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((_, row) => (
              <Skeleton key={row} className="size-3 rounded-[2px]" />
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** The Rep performance trends table. */
export function RepTrendsSkeleton() {
  return (
    <Panel title="Rep performance trends">
      <div className="space-y-3">
        <div className="flex justify-between border-b pb-2">
          <Skeleton className="h-3 w-16" />
          <div className="flex gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-10" />
            ))}
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-6">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-12" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** The editable dashboard cards board (wide cards + tile grid). */
export function DashboardCardsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card overflow-hidden rounded-xl border">
            <div className="border-b px-5 py-3.5">
              <Skeleton className="h-4 w-44" />
            </div>
            <div className="space-y-4 p-5">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex gap-3">
                  <Skeleton className="mt-1.5 size-1.5 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full max-w-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-border grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card space-y-3 p-5">
            <div className="flex items-start justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="size-6 rounded-md" />
            </div>
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
