import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { indexToCircled, type AudioTrack } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './TaskAudio';

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
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {rows.map((track, index) => (
            <Pressable
              key={track.key}
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
          ))}
        </View>
      )}

      {failed && <Text className="text-xs text-muted-foreground">{t('msg.failed_to_load_url')}</Text>}
    </View>
  );
}
