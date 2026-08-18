import { Skeleton } from "@/components/ui/skeleton";

/**
 * What the dashboard looks like while it loads.
 *
 * Shaped like the real page, not a generic spinner. A skeleton that matches the
 * final layout means nothing jumps when the data arrives, and the wait reads as
 * "this is loading" rather than "this is broken".
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="space-y-3 py-2">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <Skeleton className="h-10 w-72 rounded-xl" />

      <div className="bg-card space-y-6 rounded-xl border p-5">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t pt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-32 rounded-full" />
          ))}
        </div>
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
    </div>
  );
}
