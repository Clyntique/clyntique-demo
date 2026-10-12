import { Skeleton } from "@/components/ui/states";

// Loading state shared by every workspace page: a title block and the list
// groups most pages are built from, so content lands where the skeleton was.
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-8">
      <span className="sr-only" role="status">
        Loading…
      </span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-6">
        {[3, 2].map((rows, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="border-b border-line px-4 py-3">
              <Skeleton className="h-3.5 w-32" />
            </div>
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <Skeleton className="h-12 w-10 rounded-sm" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
