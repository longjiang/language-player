'use client';

/**
 * Loading placeholder for a dictionary entry card — shown in the popup
 * dictionary while entries or phrase cards are being fetched, instead of a
 * spinner, so the popup's shape stays stable (and its top edge fixed) while
 * it loads. Mirrors the compact DictionaryEntryCard's layout: head line,
 * pronunciation, definition bars, source + save slots.
 */
export function DictionaryEntryCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border bg-card p-3 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="ml-auto h-4 w-10 rounded bg-muted" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-4/5 rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-6 w-20 rounded-md bg-muted" />
      </div>
    </div>
  );
}
