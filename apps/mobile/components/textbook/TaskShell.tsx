import React, { useCallback, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useInstructionTranslation } from '@/hooks/use-instruction-translation';
import { useTextbookTask } from './task-provider';
import { WordBank } from './WordBank';
import { BlankChoiceProvider } from './BlankChoice';
import { AudioPlayer } from './AudioPlayer';
import { TaskAudioProvider } from './TaskAudio';
import { RecallCard } from './RecallCard';
import { PictureSet } from './PictureSet';
import { DataTable } from './DataTable';
import { DialoguePassage } from './DialoguePassage';
import { NumberedBlanks } from './NumberedBlanks';
import { ImageMap } from './ImageMap';
import { MockAppFrame } from './MockAppFrame';
import { Dictation } from './DictationField';
import { FreeWrite, NoteCards } from './FreeWrite';

/**
 * The frame every task renders inside.
 *
 * This is the consistency anchor: the task number, tokenized instructions,
 * submit/reset controls and result banner are identical for every task, so a
 * heterogeneous set of activities reads as one product. A task's own stimulus
 * widgets render in the middle and are free to look however they must.
 */
export function TaskShell({ children }: { children?: React.ReactNode }) {
  const ctx = useTextbookTask()!;
  const { task, book } = ctx;
  const { l1Lang, l2Lang } = useLanguage();
  const { getL2 } = useSettingsContext();
  const t = useT();

  // Per-L2 display setting, shared with the readers — not a textbook-specific
  // toggle. When on, the L2 instructions get a machine translation underneath.
  const showTranslation = getL2(l2Lang.code).display.translation;
  const instructionTranslation = useInstructionTranslation(
    task.instructions,
    l1Lang.code,
    l2Lang.code,
    showTranslation,
  );

  const submitted = useSyncExternalStore(
    ctx.store.subscribe,
    useCallback(() => ctx.store.isSubmitted(), [ctx]),
    useCallback(() => ctx.store.isSubmitted(), [ctx]),
  );
  const result = useSyncExternalStore(
    ctx.store.subscribe,
    useCallback(() => ctx.store.getResult(), [ctx]),
    useCallback(() => ctx.store.getResult(), [ctx]),
  );
  const responses = useSyncExternalStore(
    ctx.store.subscribe,
    useCallback(() => ctx.store.getResponsesSnapshot(), [ctx]),
    useCallback(() => ctx.store.getResponsesSnapshot(), [ctx]),
  );

  const banks = task.banks ?? [];
  const hasBlanks = Object.keys(task.blanks ?? {}).length > 0;
  // Nothing to grade: every blank is a worked example or ungraded prose.
  const hasNothingToScore = !Object.values(task.blanks ?? {}).some(
    (b) => b.kind !== 'given' && b.kind !== 'free',
  );
  const anyAnswer = Object.values(responses).some((v) => v.trim());

  return (
    // The playback engine wraps the whole task, so the audio row at the top and the
    // inline controls inside the stimulus share one player and only one track can
    // play at a time.
    <TaskAudioProvider tracks={task.audio ?? []}>
    {/* One picture-choice dialog for the whole task: a blank opens it, and it is
        rendered here rather than by each blank so thirty blanks are not thirty
        modals. */}
    <BlankChoiceProvider>
    <ScrollView contentContainerClassName="gap-5 pb-16" className="flex-1">
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5 h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Text className="text-sm font-semibold text-primary">{task.number}</Text>
        </View>
        <View className="flex-1">
          {/* Instructions are L2 text rendered through TokenizedText, so they
              carry ruby and are tappable like any other L2 text. */}
          <TokenizedText text={task.instructions} l2Code={l2Lang.code} />
          {instructionTranslation && (
            <Text className="mt-1 text-sm text-muted-foreground">{instructionTranslation}</Text>
          )}
        </View>
      </View>

      <AudioPlayer tracks={task.audio ?? []} />

      {children}

      {banks.map((bank) => (
        <WordBank key={bank.id} bank={bank} />
      ))}

      <View className="flex-row flex-wrap items-center gap-3">
        <Pressable
          onPress={() => ctx.store.submit()}
          disabled={hasBlanks && !anyAnswer}
          accessibilityRole="button"
          className={`rounded-md bg-primary px-4 py-2 ${hasBlanks && !anyAnswer ? 'opacity-50' : ''}`}
        >
          <Text className="text-sm font-medium text-primary-foreground">{t('review.submit')}</Text>
        </Pressable>
        <Pressable
          onPress={() => ctx.store.reset()}
          accessibilityRole="button"
          className="rounded-md border border-border px-4 py-2"
        >
          <Text className="text-sm text-foreground">{t('action.try_again')}</Text>
        </Pressable>
      </View>

      {submitted && result && (
        <View
          accessibilityRole="alert"
          className={`rounded-md border px-4 py-3 ${
            result.complete ? 'border-green-600 bg-green-500/10' : 'border-destructive bg-destructive/10'
          }`}
        >
          <Text className="text-sm text-foreground">
            {hasNothingToScore ? (
              // Nothing to grade — note-taking, a draft, a self-check — so it must not
              // report "0 / 0" as though the student failed.
              t('label.saved')
            ) : (
              <>
                {result.complete ? t('review.answer_correct') : t('review.answer_incorrect')}
                <Text className="text-muted-foreground">
                  {'  '}
                  {result.correctCount} / {result.scoreableCount}
                </Text>
              </>
            )}
          </Text>
        </View>
      )}

      <Text className="text-xs text-muted-foreground">{book.title}</Text>
    </ScrollView>
    </BlankChoiceProvider>
    </TaskAudioProvider>
  );
}

/**
 * Renders the task's stimulus blocks, in authored order.
 *
 * An unknown kind renders nothing rather than throwing, so a content file from a
 * newer client cannot break an older one outright — the validator is what
 * catches genuinely broken content.
 */
export function TaskStimulus() {
  const ctx = useTextbookTask()!;
  const { l2Lang } = useLanguage();

  return (
    <>
      {ctx.task.body.map((stimulus, i) => {
        switch (stimulus.kind) {
          case 'passage':
            return (
              <View key={i} className="gap-2">
                {stimulus.audio && stimulus.audio.length > 0 && (
                  <AudioPlayer tracks={stimulus.audio} />
                )}
                <TokenizedText text={stimulus.text} l2Code={l2Lang.code} leading={2} />
              </View>
            );
          case 'recall':
            return <RecallCard key={i} stimulus={stimulus} />;
          case 'audio':
            return (
              <View key={i} className="gap-2">
                {stimulus.label ? (
                  <Text className="text-sm font-medium text-foreground">{stimulus.label}</Text>
                ) : null}
                <AudioPlayer tracks={stimulus.tracks} />
              </View>
            );
          case 'dialogue':
            return <DialoguePassage key={i} dialogue={stimulus} />;
          case 'dataTable':
            return <DataTable key={i} table={stimulus} />;
          case 'pictureSet':
            return <PictureSet key={i} set={stimulus} />;
          case 'numberedBlanks':
            return <NumberedBlanks key={i} ids={stimulus.ids} />;
          case 'imageMap':
            return <ImageMap key={i} map={stimulus} />;
          case 'mockApp':
            return <MockAppFrame key={i} stimulus={stimulus} />;
          case 'dictation':
            return <Dictation key={i} ids={stimulus.ids} />;
          case 'freeWrite':
            return <FreeWrite key={i} blankId={stimulus.blankId} rows={stimulus.rows} />;
          case 'noteCards':
            return <NoteCards key={i} cards={stimulus.cards} />;
          default:
            return null;
        }
      })}
    </>
  );
}
