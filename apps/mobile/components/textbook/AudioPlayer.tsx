import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { indexToCircled, unanchoredTracks, type AudioTrack } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './TaskAudio';

/**
 * The task's audio row.
 *
 * Renders the tracks that belong to the task as a whole. Tracks bound to an item
 * (`AudioTrack.blankId`) are deliberately NOT listed here: their control belongs
 * beside that item, placed by whichever widget renders its blank, so a student reads
 * down a table and plays each row's recording in place instead of counting `①`-`⑦`
 * buttons against rows.
 *
 * The playback engine lives in `TaskAudioProvider`, so this component is only the
 * row's presentation.
 */
export function AudioPlayer({ tracks }: { tracks: AudioTrack[] }) {
  const t = useT();
  const audio = useTaskAudio();
  const rows = unanchoredTracks(tracks);

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
