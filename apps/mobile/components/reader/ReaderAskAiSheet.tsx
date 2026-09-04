import React from 'react';
import { View, Text, Modal, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
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
  /** The reading subject (title) shown in the modal header. */
  title: string;
  /** The reader's content snapshot for the summary presets. */
  content: ReaderAiContent;
  /** The summary preset set for this reader (text page / epub). */
  presets: AiFollowUpPreset[];
}

/**
 * Reader "Ask AI" summary chat — a centered modal styled identically to the
 * reader's TOC / Search dialogs. Auto-summarizes the current page (via
 * READER_ASK_AI_INITIAL_PRESET) and preloads the reader's summary follow-up
 * buttons. Shared by the notes / web / image / epub readers.
 */
export function ReaderAskAiSheet({ open, onClose, title, content, presets }: ReaderAskAiSheetProps) {
  const t = useT();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="h-[80%] w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
                {t('action.ask_ai')}
              </Text>
              <Pressable
                onPress={onClose}
                className="rounded p-1 active:bg-muted"
                accessibilityLabel={t('action.close')}
              >
                <X size={18} color={ICON_MUTED} />
              </Pressable>
            </View>
            <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
