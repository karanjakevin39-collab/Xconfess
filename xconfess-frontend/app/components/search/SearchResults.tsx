"use client";

import { SearchResultItem } from "./SearchResultItem";
import type { SearchConfession } from "@/app/lib/types/search";
import { SkeletonCard } from "@/app/components/confession/LoadingSkeleton";
import { cn } from "@/app/lib/utils/cn";

interface SearchResultsProps {
  results: SearchConfession[];
  query?: string;
  isLoading: boolean;
  isEmpty: boolean;
  hasSearched: boolean;
  page: number;
  hasMore: boolean;
  total?: number;
  statusMeta?: {
    partial: boolean;
    degraded: boolean;
    message: string | null;
    warnings: string[];
    searchType?: string;
  } | null;
  hasActiveFilters?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onClearFilters?: () => void;
  onUseSuggestion?: (query: string) => void;
  className?: string;
  isRetrying?: boolean;
}

export function SearchResults({
  results,
  query,
  isLoading,
  isEmpty,
  hasSearched,
  page,
  hasMore,
  total,
  statusMeta,
  hasActiveFilters = false,
  onLoadMore,
  onRetry,
  onClearFilters,
  onUseSuggestion,
  className,
  isRetrying = false,
}: SearchResultsProps) {
  const suggestions = ["confession", "secret", "relationships"];

  if (isLoading && page === 1) {
    return (
      <div
        className={cn("space-y-4", className)}
        role="status"
        aria-live="polite"
        aria-label={
          isRetrying
            ? "Loading search results, retrying after a connection issue"
            : "Loading search results"
        }
      >
        {isRetrying && (
          <p className="text-center text-sm text-[var(--secondary)]">
            Search is taking longer than usual, retrying...
          </p>
        )}
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!hasSearched) {
    return (
      <div
        className={cn(
          "luxury-panel flex flex-col items-center justify-center rounded-[28px] border border-dashed px-4 py-16",
          className
        )}
        role="status"
      >
        <p className="text-center text-[var(--foreground)]">
          Enter a search term or use filters to find confessions.
        </p>
        <p className="mt-2 text-center text-sm text-[var(--secondary)]">
          Try &quot;love&quot;, &quot;secret&quot;, or &quot;coding&quot;.
        </p>
      </div>
    );
  }

  if (isEmpty && !isLoading) {
    return (
      <div
        className={cn(
          "luxury-panel flex flex-col items-center justify-center rounded-[28px] border border-dashed px-4 py-16",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <p className="text-center text-[var(--foreground)]">
          No confessions match your search.
        </p>
        <p className="mt-2 text-center text-sm text-[var(--secondary)]">
          {statusMeta?.partial
            ? "Results may be partial right now. Try a broader query while search catches up."
            : "Try different keywords or loosen your filters."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full bg-[linear-gradient(135deg,var(--primary),var(--primary-deep))] px-4 py-2 text-sm font-medium text-white shadow-[0_18px_40px_-22px_rgba(88,105,125,0.55)] transition-colors hover:brightness-105"
            >
              Retry search
            </button>
          )}
          {hasActiveFilters && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onUseSuggestion?.(suggestion)}
              className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
            >
              Try &quot;{suggestion}&quot;
            </button>
          ))}
        </div>
      </div>
    );
  }

  const start = 1;
  const end = results.length;
  const showCount = total != null && total > 0;

  return (
    <div className={cn("space-y-4", className)} role="region" aria-label="Search results">
      {statusMeta?.degraded && (
        <div
          className="rounded-[22px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--foreground)]"
          role="status"
        >
          <p className="font-medium">
            {statusMeta.partial
              ? "Partial results shown"
              : "Search is in a degraded state"}
          </p>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            {statusMeta.message ||
              statusMeta.warnings[0] ||
              "Some upstream data may be delayed. You can retry or continue with the current results."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-white/65 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-white"
              >
                Retry
              </button>
            )}
            {hasActiveFilters && onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="rounded-full border border-[var(--border)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--secondary)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--foreground)]"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {showCount && (
        <p className="text-sm text-[var(--secondary)]">
          Showing {start}-{end} of {total} result{total !== 1 ? "s" : ""}
        </p>
      )}

      <ul className="list-none space-y-3" role="list">
        {results.map((c) => (
          <li key={c.id} role="listitem">
            <SearchResultItem confession={c} searchQuery={query} />
          </li>
        ))}
      </ul>

      {isLoading && page > 1 && (
        <div className="flex justify-center py-6" aria-hidden>
          <div className="flex gap-2">
            <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:0.1s]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:0.2s]" />
          </div>
        </div>
      )}

      {hasMore && !isLoading && onLoadMore && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
