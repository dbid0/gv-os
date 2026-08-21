import { Skeleton } from "@/components/ui/skeleton";

export default function TeamLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="space-y-3 py-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <Skeleton className="h-28 w-full rounded-xl" />

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card flex items-center justify-between rounded-lg border p-3"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
