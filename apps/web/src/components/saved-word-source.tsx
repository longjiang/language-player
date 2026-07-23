'use client';

import type { SavedWordContext } from '@langplayer/shared';
import { Video, BookOpen } from 'lucide-react';

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
  // Guard against legacy/corrupt records with no context
  if (!context) {
    try { return <span className={className}>{new Date(date).toLocaleDateString()}</span>; } catch { return null; }
  }
  const hasVideoContext = !!(context.youtube_id && context.videoTitle);
  const hasTextContext = !!context.textTitle;
  const dateStr = date ? new Date(date).toLocaleDateString() : '';

  if (!hasVideoContext && !hasTextContext) {
    return <span className={className}>{dateStr}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {hasVideoContext ? (
        <>
          <Video className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{context.videoTitle}</span>
        </>
      ) : (
        <>
          <BookOpen className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{context.textTitle}</span>
        </>
      )}
      <span>· {dateStr}</span>
    </span>
  );
}
