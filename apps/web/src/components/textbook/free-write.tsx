'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import { useTextbookTask } from './task-provider';

/**
 * An open writing surface.
 *
 * Backed by a `free` blank, which is recorded but never scored — there is no
 * correct answer to a free-writing prompt, and grading one would be worse than
 * not asking. The student's text still persists with the rest of the attempt.
 */
export function FreeWrite({ blankId, rows = 6 }: { blankId: string; rows?: number }) {
  const ctx = useTextbookTask();

  const getValue = useCallback(() => ctx!.store.getValue(blankId), [ctx, blankId]);
  const value = useSyncExternalStore(ctx!.store.subscribe, getValue, getValue);

  return (
    <textarea
      value={value}
      onChange={(e) => ctx!.store.setValue(blankId, e.target.value)}
      rows={rows}
      className="w-full resize-y rounded-lg border border-border bg-card p-3 text-base leading-relaxed text-foreground outline-none focus:border-primary"
    />
  );
}

/**
 * Note-taking into titled cards.
 *
 * D ➏: the student listens and writes notes under five topics. The workbook
 * pre-fills the 路线 card's first two lines as a worked example, so the cards are
 * blank inputs the student continues rather than a pre-filled field.
 */
export function NoteCards({ cards }: { cards: Array<{ blankId: string; title: string }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <div key={card.blankId} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
          <span className="text-sm font-medium text-foreground">{card.title}</span>
          <FreeWrite blankId={card.blankId} rows={4} />
        </div>
      ))}
    </div>
  );
}
