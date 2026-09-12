import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { indexToCircled, type AudioTrack } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './TaskAudio';
import { TranscriptButton } from './TranscriptDialog';

/**
 * A set of recordings, rendered as a row.
 *
 * Used for the task's own audio (`task.audio`) and for an `audio` block. Recordings
 * declared on an item are NOT routed through here — the item renders its own control
 * beside itself, so a student plays each row's recording where they answer it.
 *
 * The playback engine lives in `TaskAudioProvider`, so this is only presentation.
 */
export function AudioPlayer({ tracks }: { tracks: AudioTrack[] }) {
  const t = useT();
  const audio = useTaskAudio();
  const rows = tracks ?? [];

  if (!audio || rows.length === 0) return null;

  const failed = rows.some((track) => audio.failed.has(track.key));

  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-3">
      {rows.length === 1 ? (
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => audio.toggle(rows[0]!.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: audio.activeKey === rows[0]!.key }}
            accessibilityLabel={rows[0]!.label ?? t('action.speak')}
            className={`items-center rounded-md px-4 py-2 ${
              audio.activeKey === rows[0]!.key ? 'bg-primary/20' : 'bg-primary'
            }`}
          >
            <Text
              className={
                audio.activeKey === rows[0]!.key
                  ? 'text-sm font-medium text-primary'
                  : 'text-sm font-medium text-primary-foreground'
              }
            >
              {audio.activeKey === rows[0]!.key ? '❚❚' : '▶'}
            </Text>
          </Pressable>
          <TranscriptButton track={rows[0]!} />
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {rows.map((track, index) => (
            // Each track keeps its own transcript button: A ➊'s nine recordings each say
            // something different, so "the transcript" is only meaningful per recording.
            // It is absent where a recording has no transcript.
            <View key={track.key} className="flex-row items-center gap-1">
              <Pressable
                onPress={() => audio.toggle(track.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: audio.activeKey === track.key }}
                // The label is the accessible name, never visible text: in the
                // dictation tasks it is the answer.
                accessibilityLabel={track.label ?? `track ${index + 1}`}
                className={`h-9 w-9 items-center justify-center rounded-full border ${
                  audio.activeKey === track.key ? 'border-primary bg-primary' : 'border-border bg-background'
                }`}
              >
                <Text
                  className={`text-sm ${
                    audio.activeKey === track.key ? 'text-primary-foreground' : 'text-foreground'
                  }`}
                >
                  {indexToCircled(index + 1)}
                </Text>
              </Pressable>
              <TranscriptButton track={track} />
            </View>
          ))}
        </View>
      )}

      <Transport />

      {failed && <Text className="text-xs text-muted-foreground">{t('msg.failed_to_load_url')}</Text>}
    </View>
  );
}

/**
 * Elapsed time, ±10s steppers and replay for the active track.
 *
 * Steppers rather than a scrub bar: React Native has no range input, and adding a
 * slider dependency for this would be a new native module. Ten seconds is the step
 * that matters — the workbook's listening items are a sentence or two, so one tap
 * back is a re-listen.
 */
function Transport() {
  const t = useT();
  const audio = useTaskAudio();
  const active = audio?.activeKey != null;
  const { currentTime, duration } = {
    currentTime: audio?.currentTime ?? 0,
    duration: audio?.duration ?? 0,
  };

  const step = (label: string, delta: number) => (
    <Pressable
      key={label}
      onPress={() => audio?.seekBy(delta)}
      disabled={!active}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-7 rounded-full border border-border bg-background px-2 ${active ? '' : 'opacity-40'}`}
    >
      <Text className="text-[10px] text-foreground">{label}</Text>
    </Pressable>
  );

  return (
    <View className="flex-row items-center gap-2">
      {step('−10s', -10)}
      <Text className="text-xs tabular-nums text-muted-foreground">
        {formatTime(currentTime)} / {formatTime(duration)}
      </Text>
      {step('+10s', 10)}
      <Pressable
        onPress={() => audio?.replay()}
        disabled={!active}
        accessibilityRole="button"
        accessibilityLabel={t('action.replay')}
        className={`h-7 rounded-full border border-border bg-background px-2 ${active ? '' : 'opacity-40'}`}
      >
        <Text className="text-[10px] text-foreground">{t('action.replay')}</Text>
      </Pressable>
    </View>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
