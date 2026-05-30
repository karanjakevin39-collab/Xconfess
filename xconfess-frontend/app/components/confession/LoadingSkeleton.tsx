function SkeletonPill({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-[var(--skeleton)] ${className}`} />;
}

export const SkeletonCard = () => (
  <div className="luxury-panel animate-pulse rounded-[30px] p-6">
    <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-[var(--skeleton)]" />
        <div className="space-y-2">
          <div className="h-4 w-28 rounded bg-[var(--skeleton)]" />
          <div className="h-3 w-20 rounded bg-[var(--accent-soft)]" />
        </div>
      </div>
      <div className="h-3 w-16 rounded bg-[var(--skeleton)]" />
    </div>

    <div className="mb-6 space-y-3">
      <div className="h-4 w-24 rounded-full bg-[var(--accent-soft)]" />
      <div className="h-7 w-full rounded bg-[var(--skeleton)]" />
      <div className="h-7 w-full rounded bg-[var(--skeleton)]" />
      <div className="h-7 w-3/4 rounded bg-[var(--skeleton)]" />
    </div>

    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <SkeletonPill className="h-10 w-16" />
        <SkeletonPill className="h-10 w-16" />
      </div>
      <div className="flex gap-2">
        <SkeletonPill className="h-10 w-20" />
        <SkeletonPill className="h-10 w-20" />
        <SkeletonPill className="h-10 w-20" />
      </div>
    </div>
  </div>
);

export function ConfessionFeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="space-y-5"
      role="status"
      aria-live="polite"
      aria-label="Loading confessions"
    >
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={`confession-skeleton-${index}`} />
      ))}
    </div>
  );
}

export function CommentSectionSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-label="Loading comments"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`comment-skeleton-${index}`}
          className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="h-4 w-28 animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-zinc-800" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConfessionDetailSkeleton() {
  return (
    <div
      className="space-y-8"
      role="status"
      aria-live="polite"
      aria-label="Loading confession details"
    >
      <div className="h-8 w-32 animate-pulse rounded bg-zinc-800" />
      <SkeletonCard />
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-6">
        <div className="mb-4 h-5 w-40 animate-pulse rounded bg-zinc-800" />
        <CommentSectionSkeleton />
      </div>
    </div>
  );
}
