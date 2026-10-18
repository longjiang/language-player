import React, { useEffect, useState } from 'react';
import { findTask, pictureSetsIn, type BlankSpec } from '@langplayer/textbooks';
import { InlineImageSlot } from './InlineImageSlot';
import { loadPersistedTask, useTextbookTask } from './task-provider';

/**
 * A picture carried from an earlier task, shown read-only (SPEC-095).
 *
 * B ➏ is B ➎'s article again: ➎ asks where six illustrations go, ➏ asks for the words.
 * Reading ➏ without ➎'s pictures makes two halves of one page look unrelated, so each
 * tip's box shows the picture placed there.
 *
 * The pick is read from the earlier task's saved state (ADR-0044 keeps exercise state
 * device-local) rather than copied into this task, so re-answering ➎ changes what ➏
 * shows and nothing here can go stale. Storage is read after mount and ignored if the
 * screen unmounts first — the same shape as `RecallCard`.
 *
 * An unanswered earlier task leaves the box empty. It must not show the "tap to choose"
 * prompt, because this task has nothing to answer.
 */
export function CarriedSlot({
  blank,
  layout,
}: {
  blank: BlankSpec;
  layout: 'inline' | 'gutter';
}) {
  const ctx = useTextbookTask()!;
  const fromTaskId = blank.carriedFrom?.taskId;
  const fromBlankId = blank.carriedFrom?.blankId;
  const [picked, setPicked] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!fromTaskId || !fromBlankId) {
      setPicked('');
      return;
    }
    loadPersistedTask(fromTaskId).then((state) => {
      if (!cancelled) setPicked(state?.responses?.[fromBlankId] ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [fromTaskId, fromBlankId]);

  // The image and its caption come from the picture set the *source* blank answers from;
  // this task does not carry the set itself.
  const source = fromTaskId ? findTask(ctx.book, fromTaskId) : undefined;
  const sourceBlank = fromBlankId ? source?.blanks?.[fromBlankId] : undefined;
  const set =
    source && sourceBlank?.optionSet
      ? pictureSetsIn(source).get(sourceBlank.optionSet)
      : undefined;
  const item = set?.items.find((i) => i.letter === picked);

  return (
    <InlineImageSlot blank={blank} value={picked} layout={layout} readOnly item={item} />
  );
}
