'use client';

import React from 'react';
import type { AudioTrack } from '@langplayer/textbooks';
import { indexToCircled, unanchoredTracks } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './task-audio';

/**
 * The task's audio row.
 *
 * Renders the tracks that belong to the task as a whole. Tracks bound to an item
 * (`AudioTrack.blankId`) are deliberately NOT listed here: their control belongs
 * beside that item, placed by whichever widget renders its blank, so a student
 * reads down a table and plays each row's recording in place instead of counting
 * `①`-`⑦` buttons against rows.
 *
 * The playback engine itself lives in `TaskAudioProvider`, so this component is
 * only the row's presentation.
 */
export function AudioPlayer({ tracks }: { tracks: AudioTrack[] }) {
  const t = useT();
  const audio = useTaskAudio();
  const rows = unanchoredTracks(tracks);

  if (!audio || rows.length === 0) return null;

  // One unanchored track gets the large control with a progress bar; a run of
  // them gets the numbered compact row.
  const single = rows.length === 1;
  const failed = rows.some((track) => audio.failed.has(track.key));

  return (
    <section
      aria-label={t('label.subtitles')}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
    >
      {single ? (
        <div className="flex items-center gap-3">
          <PlayButton
            playing={audio.activeKey === rows[0]!.key}
            label={rows[0]!.label ?? t('action.speak')}
            onClick={() => audio.toggle(rows[0]!.key)}
          />
          <ProgressBar value={audio.activeKey === rows[0]!.key ? audio.progress : 0} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {rows.map((track, index) => (
              <button
                key={track.key}
                type="button"
                onClick={() => audio.toggle(track.key)}
                // The label is the accessible name, never visible text: in the
                // dictation tasks it is the answer.
                aria-label={track.label ?? `track ${index + 1}`}
                aria-pressed={audio.activeKey === track.key}
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm transition-colors ${
                  audio.activeKey === track.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                {indexToCircled(index + 1)}
              </button>
            ))}
          </div>
          <ProgressBar value={audio.activeKey !== null ? audio.progress : 0} />
        </>
      )}

      {failed && <p className="text-xs text-muted-foreground">{t('msg.failed_to_load_url')}</p>}
    </section>
  );
}

export function PlayButton({
  playing,
  label,
  onClick,
}: {
  playing: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={playing}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
    >
      {playing ? (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="1.5" y="1" width="3" height="10" fill="currentColor" />
          <rect x="7.5" y="1" width="3" height="10" fill="currentColor" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 1l9 5-9 5z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-150"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}
