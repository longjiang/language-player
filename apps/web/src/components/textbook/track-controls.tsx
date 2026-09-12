'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import type { AudioTrack } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './task-audio';
import { useTaskTranscripts, useTranscriptDialog } from './transcript-dialog';

/**
 * One recording's controls, as a single segmented pill: play/pause, then its transcript
 * when the recording has one (SPEC-095 §Transcript).
 *
 * Two controls that belong to one recording read as one control, not as two round buttons
 * standing next to each other and not as a stray transcript icon somewhere else in the row:
 * the pill is the item's audio, and its segments are what you can do with it. The seam is a
 * hairline divider rather than a gap, so a row of them (A ➊ has nine) stays quiet.
 *
 * It is always the same pill, in the same two segments, wherever a recording is offered:
 * the item's own control beside a numbered slot, and each track of a task's audio row both
 * read as `② [▶|▤]`. The numeral is printed by the caller, outside the pill, rather than
 * inside the play segment — a circled number does not read as "play", and a student who has
 * met `② [▶|▤]` on one task should not have to learn a different control on the next.
 *
 * A recording with no transcript gets a one-segment pill: the transcript segment is absent
 * rather than disabled, so the affordance never promises text that is not there.
 */

const SEGMENT = {
  sm: { box: 'h-7 w-8', glyph: 10, icon: 13 },
  md: { box: 'h-9 w-11', glyph: 12, icon: 16 },
} as const;

export function TrackControls({
  track,
  size = 'sm',
}: {
  track: AudioTrack;
  size?: keyof typeof SEGMENT;
}) {
  const t = useT();
  const audio = useTaskAudio();
  const dialog = useTranscriptDialog();
  const transcripts = useTaskTranscripts();

  if (!audio) return null;

  const playing = audio.activeKey === track.key;
  const broken = audio.failed.has(track.key);
  const transcript = dialog && transcripts.has(track.key) ? dialog : null;
  const s = SEGMENT[size];

  return (
    <span className="inline-flex shrink-0 items-center divide-x divide-border overflow-hidden rounded-full border border-border">
      <button
        type="button"
        onClick={() => audio.toggle(track.key)}
        // The label is the accessible name, never visible text: in the dictation tasks it
        // is the answer.
        aria-label={track.label ?? t('action.speak')}
        aria-pressed={playing}
        disabled={broken}
        title={broken ? t('msg.failed_to_load_url') : undefined}
        className={`flex ${s.box} shrink-0 items-center justify-center transition-colors disabled:opacity-40 ${
          playing
            ? 'bg-primary text-primary-foreground'
            : 'bg-background text-foreground hover:bg-muted'
        }`}
      >
        {playing ? <PauseGlyph size={s.glyph} /> : <PlayGlyph size={s.glyph} />}
      </button>

      {transcript && (
        <button
          type="button"
          onClick={() => transcript.open(track.key)}
          aria-label={t('title.transcript')}
          title={t('title.transcript')}
          className={`flex ${s.box} shrink-0 items-center justify-center bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
        >
          <FileText size={s.icon} aria-hidden />
        </button>
      )}
    </span>
  );
}

function PlayGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <path d="M2 1l9 5-9 5z" fill="currentColor" />
    </svg>
  );
}

function PauseGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <rect x="1.5" y="1" width="3" height="10" fill="currentColor" />
      <rect x="7.5" y="1" width="3" height="10" fill="currentColor" />
    </svg>
  );
}
