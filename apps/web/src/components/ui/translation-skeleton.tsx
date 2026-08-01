'use client';

interface TranslationSkeletonProps {
  /** Original text whose length estimates how many skeleton lines to show. */
  text: string;
  /** Tailwind classes for the wrapping column (spacing, margins, text size). */
  className?: string;
  /** Tailwind classes for each bar (height, etc.). Default: `h-3.5`. */
  barClassName?: string;
}

/**
 * Placeholder bars shown while a translation loads. Line count is estimated
 * from the original text length (~50 chars per line), and bar widths cycle
 * through a natural paragraph silhouette.
 */
export function TranslationSkeleton({
  text,
  className = '',
  barClassName = 'h-3.5',
}: TranslationSkeletonProps) {
  return (
    <div className={`flex flex-col gap-y-1.5 ${className}`}>
      {Array.from({ length: Math.max(1, Math.ceil(text.length / 50)) }).map((_, li) => (
        <div
          key={li}
          className={`bg-muted rounded animate-pulse ${barClassName}`}
          style={{ width: `${['90%', '75%', '60%', '80%', '50%'][li % 5]}` }}
        />
      ))}
    </div>
  );
}
