import React, { useCallback, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useInstructionTranslation } from '@/hooks/use-instruction-translation';
import { useTextbookTask } from './task-provider';
import { WordBank } from './WordBank';
import { dialogBankIds, inlineBankIds, isBlankScoreable, trailingIllustrationSlot } from '@langplayer/textbooks';
import { BlankChoiceProvider } from './BlankChoice';
import { BlankField } from './BlankField';
import { AudioPlayer } from './AudioPlayer';
import { TaskAudioProvider } from './TaskAudio';
import { TranscriptDialogProvider } from './TranscriptDialog';
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
  /** A mock app submits itself, from its own panel — see the controls below. */
  const hasMockApp = (task.body ?? []).some((s) => s.kind === 'mockApp');
  const hasBlanks = Object.keys(task.blanks ?? {}).length > 0;
  // Nothing to grade: every blank is a worked example, ungraded prose, a carried pick or a
  // self-check answer.
  const hasNothingToScore = !Object.values(task.blanks ?? {}).some(isBlankScoreable);
  /**
   * Whether the task asks for anything at all. A self-check task (C ➌) has no input, nothing
   * to grade and no attempt to submit — checking its answers records its completion — so the
   * Submit / Try again pair is not rendered rather than shown and disabled.
   */
  const hasAnswerable = Object.values(task.blanks ?? {}).some(
    (b) => b.kind === 'choose' || b.kind === 'type' || b.kind === 'free',
  );
  const anyAnswer = Object.values(responses).some((v) => v.trim());
  /**
   * The task's own audio row is the scroll view's second child (after the
   * instructions) and is pinned with `stickyHeaderIndices`, so a long passage — B ➎'s
   * article runs past a screen and a half — cannot take the transport away with it.
   *
   * React Native has no sticky positioning outside a ScrollView's direct children, and
   * a bar nested in a passage block (A ➍, D ➊) cannot be hoisted without detaching it
   * from the item it plays, so those stay with their item. The index is only passed
   * when the row exists: `Children.toArray` drops a null child, which would shift the
   * index onto the stimulus and pin the whole task body instead.
   */
  const hasTaskAudio = (task.audio ?? []).length > 0;

  return (
    // The playback engine wraps the whole task, so the audio row at the top and the
    // inline controls inside the stimulus share one player and only one track can
    // play at a time. It is given the task, not `task.audio`, so an item's own
    // recording (A ➋/➌/➍) resolves just as the task-level row's does.
    <TaskAudioProvider task={task}>
    {/* One picture-choice dialog for the whole task: a blank opens it, and it is
        rendered here rather than by each blank so thirty blanks are not thirty
        modals. */}
    <BlankChoiceProvider>
    {/* The transcript dialog is the same shape as the picture choices for the same
        reason: one per task, opened by whichever audio control carries the recording. */}
    <TranscriptDialogProvider>
    {/* Task bodies put text fields inline — fill-in blanks inside a passage,
        dictation boxes, free-write areas — so the scroll view has to keep the
        focused one visible: a task can be far taller than the screen, and the
        keyboard covers the bottom of it. `keyboardShouldPersistTaps` so a tap
        on the next blank lands in the field instead of only dismissing the
        keyboard (SPEC-095, same convention as the review card in SPEC-066). */}
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-5 pb-16"
      className="flex-1"
      stickyHeaderIndices={hasTaskAudio ? [1] : undefined}
    >
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

      {/* Only the pools nothing prints inline. A passage that names a bank prints it under
          itself — A ➍'s summaries each carry their own three words — and printing it here as
          well would put the same pool on the page twice, where the second copy reads as a
          second, different pool. */}
      {banks
        .filter((bank) => !inlineBankIds(task).has(bank.id) && !dialogBankIds(task).has(bank.id))
        .map((bank) => (
          <WordBank key={bank.id} bank={bank} />
        ))}

      {/* A mock-app task submits from inside its own panel — one task at a time, with
          feedback at each step, and All Done! as the resolution that grades the task and
          records the attempt. Two submit controls for one task would be one too many, and
          the panel's is the one that knows which task is being answered. The result banner
          below still reports the outcome. */}
      {!hasMockApp && hasAnswerable && (
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
      )}

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
    </KeyboardAwareScrollView>
    </TranscriptDialogProvider>
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
  // B ➎'s illustration boxes print beside their paragraph on a wide screen, as the
  // workbook prints them. React Native has no `md:` classes, so the layout decides here.
  const { isMd } = useResponsive();

  return (
    <>
      {ctx.task.body.map((stimulus, i) => {
        switch (stimulus.kind) {
          case 'passage': {
            const slot = trailingIllustrationSlot(stimulus.text, ctx.task);
            return (
              <View key={i} className="gap-2">
                {stimulus.audio && stimulus.audio.length > 0 && (
                  <AudioPlayer tracks={stimulus.audio} />
                )}
                {slot.blank ? (
                  <View className={isMd ? 'flex-row items-start gap-6' : 'gap-3'}>
                    <View className="min-w-0 flex-1">
                      <TokenizedText text={slot.text} l2Code={l2Lang.code} leading={2} />
                    </View>
                    <View className={isMd ? 'w-44' : ''}>
                      <BlankField blank={slot.blank} slotLayout="gutter" />
                    </View>
                  </View>
                ) : (
                  <TokenizedText text={stimulus.text} l2Code={l2Lang.code} leading={2} />
                )}
                {/* The passage's own option pool, at the end of the item it belongs to. */}
                {(stimulus.banks ?? []).map((bankId) => {
                  const bank = (ctx.task.banks ?? []).find((b) => b.id === bankId);
                  return bank ? <WordBank key={bankId} bank={bank} /> : null;
                })}
              </View>
            );
          }
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
