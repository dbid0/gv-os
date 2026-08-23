import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shared instant skeleton (P1-7): header, KPI band, content block —
 * matches the standard page anatomy so navigation never freezes on the old
 * page. Route-specific skeletons can replace this anywhere the layout
 * diverges enough to matter.
 */
export default function GenericLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="space-y-3 py-2">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="bg-card space-y-3 rounded-xl border p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
