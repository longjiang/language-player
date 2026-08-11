import { View, type DimensionValue } from 'react-native';

interface TranslationSkeletonProps {
  /** Original text whose length estimates how many skeleton lines to show. */
  text: string;
  /** Classes for the wrapping column (spacing, margins, text size). */
  className?: string;
  /** Classes for each bar (height, etc.). Default: `h-3.5`. */
  barClassName?: string;
}

/**
 * Placeholder bars shown while a translation loads (web parity: the web
 * reader's TranslationSkeleton). Line count is estimated from the original
 * text length (~50 chars per line), and bar widths cycle through a natural
 * paragraph silhouette.
 */
export function TranslationSkeleton({
  text,
  className = '',
  barClassName = 'h-3.5',
}: TranslationSkeletonProps) {
  const widths: DimensionValue[] = ['90%', '75%', '60%', '80%', '50%'];
  return (
    <View className={`gap-y-1.5 ${className}`}>
      {Array.from({ length: Math.max(1, Math.ceil(text.length / 50)) }).map((_, li) => (
        <View
          key={li}
          className={`rounded bg-muted animate-pulse ${barClassName}`}
          style={{ width: widths[li % 5] }}
        />
      ))}
    </View>
  );
}
