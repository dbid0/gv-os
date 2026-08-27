import { Skeleton } from "@/components/ui/skeleton";

export default function LogDealLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-3 py-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-[28rem] w-full rounded-xl" />
    </div>
  );
}
