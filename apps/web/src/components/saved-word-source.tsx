'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { SavedWordContext } from '@langplayer/shared';
import { buildPlaybackVideoFromContext } from '@langplayer/shared';
import { Video, BookOpen, Play } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { SubsSearchPlaybackModal } from '@/components/video/subs-search-playback-modal';

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
 *
 * When the context is from a YouTube video, the source line is tappable and
 * reopens the shared subs-search playback modal cued/paused at the saved
 * timestamp (SPEC-066 context playback). The tokenized context sentence itself
 * stays fully interactive (per-word dictionary lookups) — only this line
 * handles the play action.
 */
export function SavedWordSource({ context, date, className = '' }: SavedWordSourceProps) {
  // Format the date in the user's native language (L1), not the UI/browser locale.
  const { l1 } = useLanguage();
  const locale = l1.code;
  const t = useT();
  const [playing, setPlaying] = useState(false);
  // Build the replayable video only when the context is from a YouTube video.
  const playbackVideo = useMemo(() => buildPlaybackVideoFromContext(context), [context]);

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
    // `max-w-full` + `min-w-0` on the truncating span let a long title shrink
    // and ellipsize inside the inline-flex row instead of overflowing the card
    // (flex items default to `min-width: auto`, which would otherwise widen the
    // row past the container and push the date out).
    const source = (
      <span className={`inline-flex max-w-full items-center gap-1 ${className}`}>
        <Video className="h-3 w-3 flex-shrink-0" />
        <span className="min-w-0 truncate">{context.videoTitle}</span>
        <span className="shrink-0">· {dateStr}</span>
      </span>
    );
    if (playbackVideo) return <PlayableSource source={source} context={context} playing={playing} playLabel={t('action.watch')} onPlay={() => setPlaying(true)} onClose={() => setPlaying(false)} />;
    return source;
  }

  if (!hasTextContext) {
    const source = <span className={className}>{dateStr}</span>;
    if (playbackVideo) return <PlayableSource source={source} context={context} playing={playing} playLabel={t('action.watch')} onPlay={() => setPlaying(true)} onClose={() => setPlaying(false)} />;
    return source;
  }

  const source = (
    <span className={`inline-flex max-w-full items-center gap-1 ${className}`}>
      <BookOpen className="h-3 w-3 flex-shrink-0" />
      <span className="min-w-0 truncate">{context.textTitle}</span>
      <span className="shrink-0">· {dateStr}</span>
    </span>
  );
  if (playbackVideo) return <PlayableSource source={source} context={context} playing={playing} playLabel={t('action.watch')} onPlay={() => setPlaying(true)} onClose={() => setPlaying(false)} />;
  return source;
}

/** Wraps the source line in a button + modal when the context is a video. */
function PlayableSource({
  source,
  context,
  playing,
  playLabel,
  onPlay,
  onClose,
}: {
  source: ReactNode;
  context: SavedWordContext;
  playing: boolean;
  playLabel: string;
  onPlay: () => void;
  onClose: () => void;
}) {
  const playbackVideo = buildPlaybackVideoFromContext(context);
  if (!playbackVideo) return source;
  return (
    <>
      <button
        type="button"
        onClick={onPlay}
        className="inline-flex max-w-full items-center gap-1 text-left transition-colors hover:text-foreground"
        aria-label={playLabel}
        title={context.videoTitle ?? playLabel}
      >
        {source}
        <Play className="h-3 w-3 flex-shrink-0 text-primary" />
      </button>
      <SubsSearchPlaybackModal
        videos={[playbackVideo]}
        index={playing ? 0 : null}
        onIndexChange={(i) => {
          if (i === null) onClose(); else onPlay();
        }}
        highlightTerms={context.form ? [context.form] : []}
        autoplay={false}
      />
    </>
  );
}
