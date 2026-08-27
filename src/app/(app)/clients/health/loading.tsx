import { Skeleton } from "@/components/ui/skeleton";

export default function ClientHealthLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-3 py-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
