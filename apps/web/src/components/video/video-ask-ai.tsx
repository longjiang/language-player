'use client';

import { useMemo } from 'react';
import { AiExplanation } from '@/components/ai-explanation';
import {
  TEXT_ACTION_ASK_AI_PRESETS,
  TEXT_ACTION_ASK_AI_INITIAL_PRESET,
  formatSubtitleContext,
} from '@langplayer/utils';

interface VideoAskAiProps {
  /** Video title (chat subject). */
  videoTitle: string;
  /** Subtitle lines with start time + L2 text (the transcript context). */
  subtitleLines: { starttime: number; l2Line: string }[];
  /** Seek the video to a time (seconds) — also dismissed the tab by the caller. */
  onSeek: (timeSeconds: number) => void;
  /** Persist the transcript under this key (per video). */
  storageKey: string;
}

/**
 * Video "Ask AI" chat — the shared `AiExplanation` chat preloaded with the full
 * subtitle transcript (timestamp-prefixed) as context, the
 * Summarize / Difficult expressions / Grammar points presets, and tappable
 * `[MM:SS]` timestamps that seek the video. The transcript persists per video.
 */
export function VideoAskAi({ videoTitle, subtitleLines, onSeek, storageKey }: VideoAskAiProps) {
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
      autoLoad
      storageKey={storageKey}
      onTimestampPress={onSeek}
      followUpPresets={TEXT_ACTION_ASK_AI_PRESETS}
      initialPreset={TEXT_ACTION_ASK_AI_INITIAL_PRESET}
      readerContent={{
        text: context,
        page: '',
        chapter: null,
        bookUpToChapter: null,
      }}
    />
  );
}
