'use client';

import React from 'react';
import { indexToCircled } from '@langplayer/textbooks';
import { useTextbookTask } from './task-provider';
import { BlankField } from './blank-field';
import { InlineTrackButton } from './inline-track-button';

/**
 * A numbered row of blanks, printed as `① ___ ② ___ ③ ___`.
 *
 * The picture-set tasks have no passage — the student listens and answers a run
 * of numbered slots — so the blanks need a container of their own. The index is
 * printed because it is how the workbook and the answer key both refer to the
 * question.
 *
 * A slot that carries its own recording renders its control after the numeral — the
 * item's number, then the pill that plays it, then the blank — so each item is heard
 * where it is answered rather than from a row of buttons at the top of the task.
 */
export function NumberedBlanks({ ids }: { ids: string[] }) {
  const ctx = useTextbookTask();
  const blanks = ctx?.task.blanks ?? {};

  return (
    <ol className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {ids.map((id, index) => {
        const blank = blanks[id];
        if (!blank) return null;
        const n = Number(id.replace(/^b/, ''));
        return (
          <li key={id} className="flex items-center gap-1.5">
            {/* The numeral comes first, then how to hear the item, then the answer: a
                student reads which question it is, plays it, and answers it. */}
            <span className="text-sm text-muted-foreground" aria-hidden>
              {indexToCircled(Number.isFinite(n) ? n : index + 1)}
            </span>
            <InlineTrackButton tracks={blank.audio} />
            <BlankField blank={blank} variant="cell" />
          </li>
        );
      })}
    </ol>
  );
}
