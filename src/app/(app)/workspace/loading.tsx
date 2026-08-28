import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="flex h-[calc(100dvh-7rem)] gap-3">
      <aside className="card-grad flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border sm:w-72">
        <div className="flex items-center gap-2 border-b px-3.5 py-3">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-4 p-3">
          {Array.from({ length: 3 }).map((_, group) => (
            <div key={group} className="space-y-1.5">
              <Skeleton className="h-6 w-40" />
              <div className="space-y-1 pl-6">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-28" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="card-grad flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
        <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="size-14 rounded-xl" />
          <Skeleton className="h-10 w-2/3" />
          <div className="space-y-2 pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </section>
    </div>
  );
}
