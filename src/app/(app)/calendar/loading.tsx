import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-3 py-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-[32rem] w-full rounded-xl" />
    </div>
  );
}
