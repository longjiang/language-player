import React from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import * as Dialog from '@/components/ui/dialog';
import type { SubtitleNoteMarker } from '@langplayer/shared';

/**
 * An inline note badge: a solid circle carrying the note's number, drawn in
 * the flow of a subtitle line where a `[n]` marker appeared. Tapping it opens
 * the note dialog (SPEC-093).
 */
export function NoteBadge({
  id,
  onPress,
  muted = false,
  style,
}: {
  id: number;
  onPress: () => void;
  /** When true (note content missing/unresolved) the badge is dimmed. */
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Note ${id}`}
      className={`mx-0.5 h-[1.1em] w-[1.1em] -translate-y-[0.1em] items-center justify-center rounded-full ${
        muted ? 'bg-muted' : 'bg-primary'
      }`}
      style={style}
      hitSlop={4}
    >
      <Text className={`text-[0.62em] font-semibold leading-none ${muted ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
        {id}
      </Text>
    </Pressable>
  );
}

/**
 * The note dialog opened when a note badge is tapped. Reuses the mobile
 * Dialog primitive (same surface the dictionary popup uses) so it inherits
 * the app's modal behavior, framing, and light-dismiss.
 */
export function NotePopup({
  note,
  onClose,
}: {
  note: SubtitleNoteMarker;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Content className="max-w-md gap-3">
          <View className="flex-row items-center gap-2">
            <NoteBadge id={note.id} onPress={() => {}} muted />
            <Dialog.Title className="flex-1 text-base font-semibold">
              {note.note || '—'}
            </Dialog.Title>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
