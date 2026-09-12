'use client';

import React from 'react';
import type { AudioTrack } from '@langplayer/textbooks';
import { indexToCircled } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './task-audio';
import { RetryIcon } from './retry-icon';
import { TrackControls } from './track-controls';

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
  const rows = tracks ?? [];

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
          <TrackControls track={rows[0]!} size="md" />
          <Transport trackKeys={[rows[0]!.key]} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {rows.map((track, index) => (
              // Each track reads exactly as a numbered item does — the numeral, then a pill
              // whose play segment is a play button — because A ➊'s nine recordings are nine
              // questions, and a student who has met ②'s row on any other task should not
              // have to learn that here the number itself is the button. The numeral is
              // decoration: it is the pill's accessible name that carries the track.
              //
              // A recording with no transcript gets a one-segment pill rather than a
              // disabled button.
              <span key={track.key} className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground" aria-hidden>
                  {indexToCircled(index + 1)}
                </span>
                <TrackControls track={track} size="md" />
              </span>
            ))}
          </div>
          <Transport trackKeys={rows.map((track) => track.key)} />
        </>
      )}

      {failed && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {t('msg.failed_to_load_url')}
          <button
            type="button"
            onClick={() => rows.forEach((track) => audio.retry(track.key))}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-foreground hover:bg-muted"
          >
            <RetryIcon />
            {t('action.retry')}
          </button>
        </p>
      )}
    </section>
  );
}

/**
 * Scrub bar, elapsed time and replay for **this player's own recordings**.
 *
 * An `<input type="range">` rather than a styled div: it gives keyboard seeking,
 * the platform's own touch behaviour, and a screen-reader value for free. Disabled
 * until one of its own tracks is the one playing, since there is nothing to seek.
 *
 * `trackKeys` is load-bearing, not a nicety. One provider owns the whole task's playback
 * (only one recording may play at a time), so position, duration and the active key are
 * task-wide — but a *transport* belongs to the recordings its own row offers. Without the
 * scope, every transport on the page read the one playing track: A ➍ prints five players,
 * and playing the first moved all five bars to 0:06 / 0:21 and armed all five replays,
 * which both misreports the other four and offers a scrub bar that would seek somebody
 * else's recording. The rows that are not playing keep an empty, disabled bar so the
 * layout does not jump when one starts.
 */
function Transport({ trackKeys }: { trackKeys: string[] }) {
  const t = useT();
  const audio = useTaskAudio();
  const active = audio?.activeKey != null && trackKeys.includes(audio.activeKey);
  const duration = active ? (audio?.duration ?? 0) : 0;

  return (
    <div className="flex flex-1 items-center gap-2">
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={active ? (audio?.currentTime ?? 0) : 0}
        disabled={!active || duration === 0}
        onChange={(e) => audio?.seekTo(Number(e.target.value))}
        aria-label={t('a11y.click_to_seek')}
        className="h-1.5 flex-1 accent-primary disabled:opacity-50"
      />
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatTime(active ? (audio?.currentTime ?? 0) : 0)} / {formatTime(duration)}
      </span>
      <button
        type="button"
        onClick={() => audio?.replay()}
        disabled={!active}
        aria-label={t('action.replay')}
        title={t('action.replay')}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M6 2.2V0.6L2.8 3l3.2 2.4V3.8a3 3 0 1 1-3 3.4H1.8A4.2 4.2 0 1 0 6 2.2z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
