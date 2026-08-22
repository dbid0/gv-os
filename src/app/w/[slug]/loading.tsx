import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-6 w-64 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
