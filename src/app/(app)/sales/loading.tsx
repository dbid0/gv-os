import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading state for every Sales view. The section layout (header + tabs) stays
 * mounted, so this only shapes the content: a KPI strip and a table, the layout
 * nearly every Sales page shares. Nothing jumps when the data lands.
 */
export default function SalesLoading() {
  return (
    <div className="space-y-6">
      <div className="bg-card space-y-6 rounded-xl border p-5">
        <Skeleton className="h-4 w-28" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="border-b px-5 py-3.5">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
