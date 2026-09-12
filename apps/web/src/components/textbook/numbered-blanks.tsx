'use client';

import React from 'react';
import { indexToCircled } from '@langplayer/textbooks';
import { useTextbookTask } from './task-provider';
import { BlankField } from './blank-field';

/**
 * A numbered row of blanks, printed as `① ___ ② ___ ③ ___`.
 *
 * The picture-set tasks have no passage — the student listens and answers a run
 * of numbered slots — so the blanks need a container of their own. The index is
 * printed because it is how the workbook and the answer key both refer to the
 * question.
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
            <span className="text-sm text-muted-foreground" aria-hidden>
              {indexToCircled(Number.isFinite(n) ? n : index + 1)}
            </span>
            <BlankField blank={blank} />
          </li>
        );
      })}
    </ol>
  );
}
