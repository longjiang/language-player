'use client';

import type { SavedWordContext } from '@langplayer/shared';
import { Video, BookOpen } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';

interface SavedWordSourceProps {
  /** Context object from a SavedLexicalItemRecord. */
  context: SavedWordContext;
  /** Unix-ms timestamp when the word was saved. */
  date: number;
  className?: string;
}

/**
 * Source attribution line for a saved word:
 *   🎬 Show Title · Jul 18
 *   📖 Book Title · Jul 18
 */
export function SavedWordSource({ context, date, className = '' }: SavedWordSourceProps) {
  // Format the date in the user's native language (L1), not the UI/browser locale.
  const { l1 } = useLanguage();
  const locale = l1.code;
  // Guard against legacy/corrupt records with no context
  if (!context) {
    try { return <span className={className}>{new Date(date).toLocaleDateString(locale)}</span>; } catch { return null; }
  }
  const hasVideoContext = !!(context.youtube_id || context.videoTitle);
  const hasTextContext = !!context.textTitle;
  const dateStr = date ? new Date(date).toLocaleDateString(locale) : '';

  // Video wins when either video field is present; a title is only shown
  // when it exists (some legacy records only store youtube_id).
  if (hasVideoContext && context.videoTitle) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <Video className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{context.videoTitle}</span>
        <span>· {dateStr}</span>
      </span>
    );
  }

  if (!hasTextContext) {
    return <span className={className}>{dateStr}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <BookOpen className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{context.textTitle}</span>
      <span>· {dateStr}</span>
    </span>
  );
}
