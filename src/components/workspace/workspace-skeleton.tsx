import { Skeleton } from "@/components/ui/skeleton";

/**
 * The Workspace loading state — a flat, Notion-shaped skeleton: a flush,
 * slightly-lighter sidebar and a borderless centered document column. No cards,
 * so the skeleton reads the same as the loaded page.
 */
export function WorkspaceSkeleton() {
  return (
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] overflow-hidden md:-m-6">
      <aside className="bg-card w-60 shrink-0 border-r">
        <div className="flex h-11 items-center gap-2 px-3">
          <Skeleton className="size-5 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-1.5 px-3 pt-4">
          <Skeleton className="mb-2 h-3 w-20" />
          <Skeleton className="h-6 w-40" />
          <div className="space-y-1 pl-6">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
      </aside>

      <section className="bg-background min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[720px] px-6 pt-[100px] sm:px-12">
          <Skeleton className="size-[78px] rounded-lg" />
          <Skeleton className="mt-3 h-10 w-2/3" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </section>
    </div>
  );
}
