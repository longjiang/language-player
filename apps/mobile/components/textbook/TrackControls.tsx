import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import type { AudioTrack } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useTaskAudio } from './TaskAudio';
import { useTaskTranscripts, useTranscriptDialog } from './TranscriptDialog';

/**
 * One recording's controls, as a single segmented pill: play/pause, then its transcript
 * when the recording has one (SPEC-095 §Transcript).
 *
 * Two controls that belong to one recording read as one control, not as two round buttons
 * standing next to each other: the pill is the item's audio, and its segments are what you
 * can do with it. The seam is a hairline divider rather than a gap, so a row of them (A ➊
 * has nine) stays quiet.
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
  sm: { box: 'h-7 w-9', glyph: 'text-[11px]', icon: 13 },
  md: { box: 'h-9 w-11', glyph: 'text-sm', icon: 16 },
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
    <View className="shrink-0 flex-row items-center overflow-hidden rounded-full border border-border">
      <Pressable
        onPress={() => audio.toggle(track.key)}
        disabled={broken}
        accessibilityRole="button"
        accessibilityState={{ selected: playing, disabled: broken }}
        // The label is the accessible name, never visible text: in the dictation tasks it
        // is the answer.
        accessibilityLabel={track.label ?? t('action.speak')}
        className={`${s.box} items-center justify-center ${
          playing ? 'bg-primary' : 'bg-background'
        } ${broken ? 'opacity-40' : ''}`}
      >
        <Text className={`${s.glyph} ${playing ? 'text-primary-foreground' : 'text-foreground'}`}>
          {playing ? '❚❚' : '▶'}
        </Text>
      </Pressable>

      {transcript && (
        <>
          <View className="h-full w-px bg-border" />
          <Pressable
            onPress={() => transcript.open(track.key)}
            accessibilityRole="button"
            accessibilityLabel={t('title.transcript')}
            hitSlop={4}
            className={`${s.box} items-center justify-center bg-background`}
          >
            <FileText size={s.icon} color={ICON_MUTED} />
          </Pressable>
        </>
      )}
    </View>
  );
}
