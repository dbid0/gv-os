import { Skeleton } from "@/components/ui/skeleton";

/** The one (app) route that had no loading boundary of its own. */
export default function AssistantLoading() {
  return (
    <div className="space-y-6">
      <div className="bg-card space-y-4 rounded-xl border p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="bg-card space-y-3 rounded-xl border p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
