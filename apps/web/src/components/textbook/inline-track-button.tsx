'use client';

import React from 'react';
import { trackForBlank, trackForAnyBlank } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './task-audio';

/**
 * A compact play/pause control for the item a track belongs to (SPEC-095).
 *
 * Renders nothing when the task has no track for this item, so a widget can place
 * it unconditionally: only tasks that bind audio to an item show the control, and
 * every other task's layout is unchanged.
 *
 * Icon-only, with no progress bar: an inline control sits inside a table row or a
 * numbered slot where a bar would either wrap or squeeze the text. The track's own
 * `label` becomes the accessible name and is never shown — in the dictation tasks
 * it is the answer.
 */
export function InlineTrackButton({
  blankId,
  blankIds,
  tracks,
}: {
  /** The item's anchor blank. */
  blankId?: string;
  /** Every blank the item owns, when a track may be anchored to any of them. */
  blankIds?: string[];
  tracks: Parameters<typeof trackForBlank>[0];
}) {
  const t = useT();
  const audio = useTaskAudio();
  const track =
    (blankId ? trackForBlank(tracks, blankId) : undefined) ??
    (blankIds ? trackForAnyBlank(tracks, blankIds) : undefined);

  if (!track || !audio) return null;

  const playing = audio.activeKey === track.key;
  const broken = audio.failed.has(track.key);

  return (
    <button
      type="button"
      onClick={() => audio.toggle(track.key)}
      aria-label={track.label ?? t('action.speak')}
      aria-pressed={playing}
      disabled={broken}
      title={broken ? t('msg.failed_to_load_url') : undefined}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
        playing
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:bg-muted'
      }`}
    >
      {playing ? (
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
          <rect x="1.5" y="1" width="3" height="10" fill="currentColor" />
          <rect x="7.5" y="1" width="3" height="10" fill="currentColor" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 1l9 5-9 5z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
