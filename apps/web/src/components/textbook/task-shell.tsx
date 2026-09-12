'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { WordBank } from './word-bank';
import { AudioPlayer } from './audio-player';
import { TaskAudioProvider } from './task-audio';
import { RecallCard } from './recall-card';
import { PictureSet } from './picture-set';
import { DataTable } from './data-table';
import { DialoguePassage } from './dialogue-passage';
import { NumberedBlanks } from './numbered-blanks';
import { ImageMap } from './image-map';
import { MockAppFrame } from './mock-app-frame';
import { useInstructionTranslation } from './use-instruction-translation';
import { Dictation } from './dictation-field';
import { FreeWrite, NoteCards } from './free-write';

/**
 * The frame every task renders inside.
 *
 * This is the consistency anchor: the task number, type, tokenized
 * instructions, submit/reset controls and result banner are identical for every
 * task, so a heterogeneous set of activities reads as one product. A task's own
 * stimulus widgets render in the middle and are free to look however they must.
 */
export function TaskShell({ children }: { children?: React.ReactNode }) {
  const ctx = useTextbookTask()!;
  const { task, book } = ctx;
  const { l1, l2 } = useLanguage();
  const { getL2 } = useSettingsContext();
  const t = useT();

  // Per-L2 display setting, shared with the readers — not a textbook-specific
  // toggle. When on, the L2 instructions get a machine translation underneath.
  const showTranslation = getL2(l2.code).display.translation;
  const instructionTranslation = useInstructionTranslation(
    task.instructions,
    l1.code,
    l2.code,
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
  // Nothing to grade: every blank is a worked example or ungraded prose.
  const hasNothingToScore = !Object.values(task.blanks ?? {}).some(
    (b) => b.kind !== 'given' && b.kind !== 'free',
  );
  const answersOnPage = Object.values(task.blanks ?? {}).filter((b) => b.kind !== 'given').length;

  return (
    // The playback engine wraps the whole task, so the audio row at the top and the
    // inline controls inside the stimulus share one media element and only one
    // track can play at a time.
    <TaskAudioProvider tracks={task.audio ?? []}>
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-1 pb-16">
      <header className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          aria-hidden
        >
          {task.number}
        </span>
        {/* `min-w-0` is load-bearing, not decoration. A flex item's automatic minimum
            size is its min-content width, and for this text that is huge: a run of
            adjacent `<ruby>` elements offers the engine no line-break opportunity
            (verified in Chromium — with no punctuation between them, a whole line of
            ruby renders as one unbreakable box), so min-content is a full run and not
            one character. Without `min-w-0` the item refuses to shrink to the column
            and the passage paints past the article — measured at 774px inside a 760px
            container, overflowing the pane by 54px. */}
        <div className="min-w-0 flex-1">
          {/* Instructions are L2 text rendered through TokenizedText, so they
              carry ruby and are tappable like any other L2 text. */}
          <div className="text-base text-foreground">
            <TokenizedText text={task.instructions} l2Code={l2.code} />
          </div>
          {instructionTranslation && (
            <p className="mt-1 text-sm text-muted-foreground">{instructionTranslation}</p>
          )}
        </div>
      </header>

      <AudioPlayer tracks={task.audio ?? []} />

      {children}

      {banks.map((bank) => (
        <WordBank key={bank.id} bank={bank} />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => ctx.store.submit()}
          disabled={answersOnPage > 0 && !Object.values(responses).some((v) => v.trim())}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {t('review.submit')}
        </button>
        <button
          type="button"
          onClick={() => ctx.store.reset()}
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          {t('action.try_again')}
        </button>
      </div>

      {submitted && result && (
        <div
          role="status"
          className={`rounded-md border px-4 py-3 text-sm ${
            hasNothingToScore
              ? 'border-border bg-muted/30 text-foreground'
              : result.complete
                ? 'border-green-600 bg-green-500/10 text-foreground'
                : 'border-destructive bg-destructive/10 text-foreground'
          }`}
        >
          {hasNothingToScore ? (
            // A task with nothing to grade — note-taking, a draft, a self-check — is
            // kept and never marked, so it must not report "0 / 0" as though it failed.
            t('label.saved')
          ) : (
            <>
              {result.complete ? t('review.answer_correct') : t('review.answer_incorrect')}
              <span className="ml-2 text-muted-foreground">
                {result.correctCount} / {result.scoreableCount}
              </span>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground" aria-hidden>
        {book.title}
      </p>
    </article>
    </TaskAudioProvider>
  );
}

/**
 * Renders the task's stimulus blocks, in authored order.
 *
 * Every kind in the `Stimulus` union has a widget here — a task whose stimulus is
 * not rendered is a task the student cannot answer, which is what A ➊ was before
 * the image map was wired in. An unknown kind renders nothing rather than
 * throwing, so a content file authored for a newer client cannot break an older
 * one outright; the validator is what catches genuinely broken content.
 */
export function TaskStimulus() {
  const ctx = useTextbookTask()!;
  const { l2 } = useLanguage();

  return (
    <>
      {ctx.task.body.map((stimulus, i) => {
        switch (stimulus.kind) {
          case 'passage':
            return (
              <div key={i} className="flex flex-col gap-2">
                {stimulus.audio && stimulus.audio.length > 0 && (
                  <AudioPlayer tracks={stimulus.audio} />
                )}
                <div className="text-lg leading-loose text-foreground">
                  <TokenizedText text={stimulus.text} l2Code={l2.code} />
                </div>
              </div>
            );
          case 'recall':
            return <RecallCard key={i} stimulus={stimulus} />;
          case 'audio':
            return (
              <div key={i} className="flex flex-col gap-2">
                {stimulus.label && (
                  <p className="text-sm font-medium text-foreground">{stimulus.label}</p>
                )}
                <AudioPlayer tracks={stimulus.tracks} />
              </div>
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
