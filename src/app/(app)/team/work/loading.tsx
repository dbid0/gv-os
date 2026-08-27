import { Skeleton } from "@/components/ui/skeleton";

export default function WorkLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-3 py-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  );
}
