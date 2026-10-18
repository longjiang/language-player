'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import type { BlankSpec } from '@langplayer/textbooks';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';

/**
 * A question the student answers in their head, then checks (SPEC-095).
 *
 * C ➌'s three comprehension questions are this shape: the printed key gives model sentences,
 * not exact strings, so a text field could not be marked against anything. The control reveals
 * the model answer for the student to compare with what they said to themselves, and hides it
 * again so the question can be re-tested. Nothing is typed, revealed in a result banner, or
 * scored.
 *
 * The reveal is stored as `'1'` in the task's responses rather than as component state, so it
 * survives a reload the same way an answer does (ADR-0044 stays the only store), and checking
 * the last question records the task's completion — a check-only task has no submit to do it.
 */
export function SelfCheck({ blank }: { blank: BlankSpec }) {
  const ctx = useTextbookTask()!;
  const t = useT();
  const { l2 } = useLanguage();

  const getChecked = useCallback(() => ctx.store.getValue(blank.id) === '1', [ctx, blank.id]);
  const checked = useSyncExternalStore(ctx.store.subscribe, getChecked, getChecked);

  const toggle = () => {
    const next = !checked;
    ctx.store.setValue(blank.id, next ? '1' : '');
    if (!next) return;
    // Completion is recorded once every question in the task has been checked: there is no
    // submit button to press, so this is what a check-only task completes on.
    const all = Object.values(ctx.task.blanks ?? {}).filter((b) => b.kind === 'selfCheck');
    const done = all.every((b) => b.id === blank.id || ctx.store.getValue(b.id) === '1');
    if (done) ctx.store.recordChecked();
  };

  return (
    <span className="mx-1 inline-flex flex-col items-start gap-1 align-baseline">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={checked}
        className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-muted"
      >
        {checked ? t('action.hide_answer') : t('action.check_answer')}
      </button>
      {checked && (
        // The answer is L2 content: tokenized, so it carries readings and every word can be
        // looked up, and tinted as an answer rather than as another line of the question.
        <span className="block rounded-md border-l-2 border-primary bg-muted/30 px-3 py-1.5 text-base text-foreground">
          <TokenizedText text={blank.answer} l2Code={l2.code} inline />
        </span>
      )}
    </span>
  );
}
