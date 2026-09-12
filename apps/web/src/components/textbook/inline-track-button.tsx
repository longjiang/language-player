'use client';

import React from 'react';
import type { AudioTrack } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './task-audio';
import { TranscriptButton } from './transcript-dialog';

/**
 * The play control an item renders beside itself (SPEC-095).
 *
 * Takes the item's OWN recordings — a row's, a numbered slot's, a passage block's —
 * rather than looking anything up, so there is no correspondence to get wrong. It
 * renders nothing when the item has no recording, so a widget can place it
 * unconditionally.
 *
 * Icon-only, with no progress bar: an inline control sits inside a table row or a
 * numbered slot where a bar would wrap or squeeze the text. The track's `label`
 * becomes the accessible name and is never shown — in the dictation tasks it is the
 * answer.
 *
 * The transcript button beside it is the same control for the same reason: it belongs
 * to this item's recording, and it is absent when that recording has no transcript.
 */
export function InlineTrackButton({ tracks }: { tracks?: AudioTrack[] }) {
  const t = useT();
  const audio = useTaskAudio();
  const track = tracks?.[0];

  if (!track || !audio) return null;

  const playing = audio.activeKey === track.key;
  const broken = audio.failed.has(track.key);

  return (
    <span className="flex shrink-0 items-center gap-1">
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
      <TranscriptButton track={track} />
    </span>
  );
}
