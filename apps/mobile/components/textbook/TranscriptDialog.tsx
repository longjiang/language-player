import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { transcriptsIn, type TranscriptLine } from '@langplayer/textbooks';
import * as Dialog from '@/components/ui/dialog';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useTranscriptTranslation } from '@/hooks/use-transcript-translation';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useTextbookTask } from './task-provider';

/**
 * A recording's transcript, on demand (SPEC-095 §Transcript).
 *
 * ## Why a dialog and not the page
 *
 * The transcript is the answer to a listening task. Putting it on the page would make every
 * listening exercise a reading exercise, and the workbook itself keeps it in a separate
 * booklet for that reason. Behind a button, a student who did not catch a word can check
 * what was said — the same choice the booklet offers — without the page answering the
 * question for them.
 *
 * ## Why a tokenized line, not a blob
 *
 * Each line is its own `TokenizedText`, so the transcript is the same L2 text as everywhere
 * else in the app: readings above the characters, every word tappable into the dictionary,
 * and (when the student has translation on) an L1 line underneath.
 *
 * ## One dialog per task
 *
 * As with the picture choices, the dialog is rendered once by the task and every control
 * calls `open(key)`: a task can carry nine recordings (A ➊) and nine dialogs is nine focus
 * traps waiting to be open at once.
 */

interface TranscriptDialogValue {
  /** Open the transcript of a recording, by asset key. */
  open: (key: string) => void;
}

const TranscriptDialogContext = createContext<TranscriptDialogValue | null>(null);

/** The task's transcript opener, or null outside a task. */
export function useTranscriptDialog(): TranscriptDialogValue | null {
  return useContext(TranscriptDialogContext);
}

/**
 * Every transcript in the book, by recording key.
 *
 * Keyed by recording rather than by task because five tasks replay someone else's file —
 * see `transcriptsIn`. Memoized on the book, which the page passes in and which is stable
 * for the life of the task.
 */
export function useTaskTranscripts(): Map<string, TranscriptLine[]> {
  const ctx = useTextbookTask();
  const book = ctx?.book;
  return useMemo(() => (book ? transcriptsIn(book) : new Map<string, TranscriptLine[]>()), [book]);
}

export function TranscriptDialogProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { l1Lang, l2Lang } = useLanguage();
  const { getL2 } = useSettingsContext();
  const transcripts = useTaskTranscripts();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const open = useCallback((key: string) => setOpenKey(key), []);
  const value = useMemo<TranscriptDialogValue>(() => ({ open }), [open]);

  const lines = openKey ? (transcripts.get(openKey) ?? null) : null;
  const texts = useMemo(() => lines?.map((line) => line.text) ?? [], [lines]);

  // The per-L2 display setting the readers and the instructions already share: on, the
  // student reads the transcript with a translation under each line.
  const showTranslation = getL2(l2Lang.code).display.translation;
  const translations = useTranscriptTranslation(texts, l1Lang.code, l2Lang.code, showTranslation);

  return (
    <TranscriptDialogContext.Provider value={value}>
      {children}

      <Dialog.Root
        open={Boolean(lines)}
        onOpenChange={(next) => {
          if (!next) setOpenKey(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Content className="max-h-[85%] max-w-2xl">
            <View className="flex-row items-center gap-2">
              {/* Deliberately not the recording's `label`: in A ➊ the label is the city
                  the recording names, which is what the student has to work out, and in
                  the dictation tasks it is the answer. The transcript's own text is the
                  answer here, so the title names the feature and nothing else. */}
              <Text className="flex-1 text-base font-semibold text-foreground">
                {t('title.transcript')}
              </Text>
              <Dialog.Close className="h-8 w-8 items-center justify-center rounded-md border border-border">
                <X size={16} color={ICON_MUTED} />
              </Dialog.Close>
            </View>

            <ScrollView style={{ maxHeight: 480, flexGrow: 0, flexShrink: 1 }}>
              <View className="gap-3">
                {lines?.map((line, i) => {
                  // Print the speaker only when it changes, so a back-and-forth reads as a
                  // conversation rather than a repeated name column — as `DialoguePassage`
                  // does on the page.
                  const previous = lines[i - 1]?.speaker;
                  const showSpeaker = Boolean(line.speaker) && line.speaker !== previous;
                  const translation = translations?.[i];
                  return (
                    <View key={i} className="flex-row gap-2">
                      <Text className="w-16 pt-0.5 text-sm font-medium text-muted-foreground">
                        {showSpeaker ? line.speaker : ''}
                      </Text>
                      <View className="min-w-0 flex-1">
                        <TokenizedText text={line.text} l2Code={l2Lang.code} />
                        {translation ? (
                          <Text className="mt-0.5 text-sm text-muted-foreground">{translation}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </TranscriptDialogContext.Provider>
  );
}
