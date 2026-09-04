import React from 'react';
import { View, Text, Modal, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '@/hooks/use-t';
import { AiExplanation } from '@/components/dictionary/AiExplanation';
import {
  READER_ASK_AI_INITIAL_PRESET,
  type AiFollowUpPreset,
  type ReaderAiContent,
} from '@langplayer/utils';
import { X } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

interface ReaderAskAiSheetProps {
  open: boolean;
  onClose: () => void;
  /** The reading subject (title) shown in the sheet header. */
  title: string;
  /** The reader's content snapshot for the summary presets. */
  content: ReaderAiContent;
  /** The summary preset set for this reader (text page / epub). */
  presets: AiFollowUpPreset[];
}

/**
 * Reader "Ask AI" summary chat — a bottom-sheet modal that auto-summarizes the
 * current page (via READER_ASK_AI_INITIAL_PRESET) and preloads the reader's
 * summary follow-up buttons. Shared by the notes / web / image / epub readers.
 */
export function ReaderAskAiSheet({ open, onClose, title, content, presets }: ReaderAskAiSheetProps) {
  const t = useT();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 justify-end bg-black/40">
        <View className="max-h-[85%] rounded-t-2xl border-t border-border bg-background">
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text className="w-9" />
            <Text className="flex-1 text-center text-base font-semibold text-foreground" numberOfLines={1}>
              {t('action.ask_ai')}
            </Text>
            <Pressable
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full"
              accessibilityLabel={t('action.close')}
            >
              <X size={18} color={ICON_MUTED} />
            </Pressable>
          </View>
          <ScrollView className="px-4 py-4" keyboardShouldPersistTaps="handled">
            <AiExplanation
              word={title}
              entryFound={true}
              autoLoad
              followUpPresets={presets}
              initialPreset={READER_ASK_AI_INITIAL_PRESET}
              readerContent={content}
            />
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
