import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { indexToCircled, type AudioTrack } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './TaskAudio';
import { TrackControls } from './TrackControls';

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
          <TrackControls track={rows[0]!} size="md" />
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-x-3 gap-y-2">
          {rows.map((track, index) => (
            // Each track reads exactly as a numbered item does — the numeral, then a pill
            // whose play segment is a play button — because A ➊'s nine recordings are nine
            // questions, and a student who has met ②'s row on any other task should not have
            // to learn that here the number itself is the button. The numeral is decoration:
            // it is the pill's accessible name that carries the track.
            //
            // A recording with no transcript gets a one-segment pill rather than a disabled
            // button.
            <View key={track.key} className="flex-row items-center gap-1.5">
              <Text className="text-sm text-muted-foreground">{indexToCircled(index + 1)}</Text>
              <TrackControls track={track} size="md" />
            </View>
          ))}
        </View>
      )}

      <Transport trackKeys={rows.map((track) => track.key)} />

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
function Transport({ trackKeys }: { trackKeys: string[] }) {
  const t = useT();
  const audio = useTaskAudio();
  // Scoped to THIS player's recordings: one provider owns the task's playback, so the
  // position, duration and active key are task-wide, while a transport belongs to the
  // recordings its own row offers. Unscoped, A ➍'s five players all showed the one
  // playing track's position and all armed their steppers and replay against it.
  const active = audio?.activeKey != null && trackKeys.includes(audio.activeKey);
  const { currentTime, duration } = {
    currentTime: active ? (audio?.currentTime ?? 0) : 0,
    duration: active ? (audio?.duration ?? 0) : 0,
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
