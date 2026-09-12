'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { WordBank } from './word-bank';
import { AudioPlayer } from './audio-player';
import { PictureSet } from './picture-set';
import { DataTable } from './data-table';
import { DialoguePassage } from './dialogue-passage';
import { NumberedBlanks } from './numbered-blanks';
import { ImageMap } from './image-map';
import { MockAppFrame } from './mock-app-frame';

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
  const { l2 } = useLanguage();
  const { getL2 } = useSettingsContext();
  const t = useT();

  // Per-L2 display setting, shared with the readers — not a textbook-specific
  // toggle.
  const showTranslation = getL2(l2.code).display.translation;

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
  const answersOnPage = Object.values(task.blanks ?? {}).filter((b) => b.kind !== 'given').length;

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-1 pb-16">
      <header className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          aria-hidden
        >
          {task.number}
        </span>
        <div className="flex-1">
          {/* Instructions are L2 text rendered through TokenizedText, so they
              carry ruby and are tappable like any other L2 text. */}
          <div className="text-base text-foreground">
            <TokenizedText text={task.instructions} l2Code={l2.code} />
          </div>
          {showTranslation && task.instructionsL1 && (
            <p className="mt-1 text-sm text-muted-foreground">{task.instructionsL1}</p>
          )}
        </div>
      </header>

      {task.audio && task.audio.length > 0 && <AudioPlayer tracks={task.audio} />}

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
            result.complete
              ? 'border-green-600 bg-green-500/10 text-foreground'
              : 'border-destructive bg-destructive/10 text-foreground'
          }`}
        >
          {result.complete ? t('review.answer_correct') : t('review.answer_incorrect')}
          <span className="ml-2 text-muted-foreground">
            {result.correctCount} / {result.scoreableCount}
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground" aria-hidden>
        {book.title}
      </p>
    </article>
  );
}

/**
 * Renders the task's stimulus blocks.
 *
 * Phase 0 implements `passage`; the remaining kinds arrive with their widgets
 * in later phases, and an unimplemented kind renders nothing rather than
 * throwing, so a newer content file cannot break an older client outright.
 */
export function TaskStimulus() {
  const ctx = useTextbookTask()!;
  const { l2 } = useLanguage();

  return (
    <>
      {ctx.task.body.map((stimulus, i) => {
        if (stimulus.kind === 'passage') {
          return (
            <div key={i} className="text-lg leading-loose text-foreground">
              <TokenizedText text={stimulus.text} l2Code={l2.code} />
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
