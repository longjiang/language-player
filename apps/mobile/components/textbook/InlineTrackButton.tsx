import React from 'react';
import { Pressable, Text } from 'react-native';
import { trackForAnyBlank, trackForBlank } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useTaskAudio } from './TaskAudio';

/**
 * A compact play/pause control for the item a track belongs to (SPEC-095).
 *
 * Renders nothing when the task has no track for this item, so a widget can place
 * it unconditionally: only tasks that bind audio to an item show the control, and
 * every other task's layout is unchanged.
 *
 * The track's `label` becomes the accessible name and is never shown — in the
 * dictation tasks it is the answer.
 */
export function InlineTrackButton({
  blankId,
  blankIds,
  tracks,
}: {
  /** The item's anchor blank. */
  blankId?: string;
  /** Every blank the item owns, when a track may be anchored to any of them. */
  blankIds?: string[];
  tracks: Parameters<typeof trackForBlank>[0];
}) {
  const t = useT();
  const audio = useTaskAudio();
  const track =
    (blankId ? trackForBlank(tracks, blankId) : undefined) ??
    (blankIds ? trackForAnyBlank(tracks, blankIds) : undefined);

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
