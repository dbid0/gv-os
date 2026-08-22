import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-3 py-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="bg-card space-y-3 rounded-xl border p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
