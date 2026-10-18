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
 * survives a reload the same way an answer does (ADR-0044 stays the only store). Completing the
 * task is a separate, explicit act: its *Mark as complete* button lives with the task controls,
 * so checking an answer never silently marks the task done.
 */
export function SelfCheck({ blank }: { blank: BlankSpec }) {
  const ctx = useTextbookTask()!;
  const t = useT();
  const { l2 } = useLanguage();

  const getChecked = useCallback(() => ctx.store.getValue(blank.id) === '1', [ctx, blank.id]);
  const checked = useSyncExternalStore(ctx.store.subscribe, getChecked, getChecked);

  const toggle = () => {
    ctx.store.setValue(blank.id, checked ? '' : '1');
  };

  return (
    // A block-level control, not an inline one: the question ends, then its button sits on the
    // next line, so a long question does not push the control to the right edge of the column.
    <span className="mt-1 flex flex-col items-start gap-1">
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
