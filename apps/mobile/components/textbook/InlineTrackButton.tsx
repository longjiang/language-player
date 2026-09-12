import React from 'react';
import { Pressable, Text } from 'react-native';
import type { AudioTrack } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './TaskAudio';

/**
 * The play control an item renders beside itself (SPEC-095).
 *
 * Takes the item's OWN recordings — a row's, a numbered slot's, a passage block's —
 * rather than looking anything up, so there is no correspondence to get wrong. It
 * renders nothing when the item has no recording, so a widget can place it
 * unconditionally.
 *
 * The track's `label` becomes the accessible name and is never shown — in the
 * dictation tasks it is the answer.
 */
export function InlineTrackButton({ tracks }: { tracks?: AudioTrack[] }) {
  const t = useT();
  const audio = useTaskAudio();
  const track = tracks?.[0];

  if (!track || !audio) return null;

  const playing = audio.activeKey === track.key;
  const broken = audio.failed.has(track.key);

  return (
    <Pressable
      onPress={() => audio.toggle(track.key)}
      disabled={broken}
      accessibilityRole="button"
      accessibilityState={{ selected: playing, disabled: broken }}
      accessibilityLabel={track.label ?? t('action.speak')}
      className={`h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
        playing ? 'border-primary bg-primary' : 'border-border bg-background'
      } ${broken ? 'opacity-40' : ''}`}
    >
      <Text className={`text-[10px] ${playing ? 'text-primary-foreground' : 'text-foreground'}`}>
        {playing ? '❚❚' : '▶'}
      </Text>
    </Pressable>
  );
}
