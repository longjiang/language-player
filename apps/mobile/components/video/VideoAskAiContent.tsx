import React, { useMemo } from 'react';
import { AiExplanation } from '@/components/dictionary/AiExplanation';
import {
  TEXT_ACTION_ASK_AI_PRESETS,
  formatSubtitleContext,
} from '@langplayer/utils';

interface VideoAskAiContentProps {
  /** Video title (chat subject). */
  videoTitle: string;
  /** Subtitle lines with start time + L2 text (the transcript context). */
  subtitleLines: { starttime: number; l2Line: string }[];
  /** Seek the video to a time (seconds) — also dismissed the tab by the caller. */
  onSeek: (timeSeconds: number) => void;
  /** Persist the transcript under this key (per video). */
  storageKey?: string;
}

/**
 * Video "Ask AI" chat — the shared `AiExplanation` chat preloaded with the full
 * subtitle transcript (timestamp-prefixed) as context, the
 * Summarize / Difficult expressions / Grammar points presets, and tappable
 * `[MM:SS]` timestamps that seek the video. The transcript persists per video.
 *
 * The chat opens in `demandMode` (no initial auto-streamed reply): the model
 * responds only when the user taps a preset button or sends a message, so the
 * video tab never shows a confusing pre-loaded "please provide the subtitles"
 * response. The subtitle transcript is preloaded as context for both the
 * preset prompts (`contentKey: 'text'`) and free-form questions.
 */
export function VideoAskAiContent({ videoTitle, subtitleLines, onSeek, storageKey }: VideoAskAiContentProps) {
  const context = useMemo(
    () =>
      formatSubtitleContext(
        subtitleLines.map((l) => ({ starttime: l.starttime, text: l.l2Line })),
      ),
    [subtitleLines],
  );

  return (
    <AiExplanation
      word={videoTitle}
      contextText={undefined}
      contextForm={undefined}
      entryFound={true}
      demandMode
      storageKey={storageKey}
      onTimestampPress={onSeek}
      followUpPresets={TEXT_ACTION_ASK_AI_PRESETS}
      readerContent={{
        text: context,
        page: '',
        chapter: null,
        bookUpToChapter: null,
      }}
    />
  );
}
