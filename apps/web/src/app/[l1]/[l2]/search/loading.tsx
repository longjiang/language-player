export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Header skeleton */}
      <div className="mb-2 h-9 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="mb-8 h-5 w-72 animate-pulse rounded-lg bg-muted" />

      {/* Search bar skeleton */}
      <div className="mt-8 flex gap-2">
        <div className="h-10 flex-1 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-24 animate-pulse rounded-lg bg-muted" />
      </div>

      {/* Tag cloud skeleton */}
      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-7 animate-pulse rounded-full bg-muted"
            style={{ width: `${60 + (i * 17) % 80}px` }}
          />
        ))}
      </div>
    </div>
  );
}
