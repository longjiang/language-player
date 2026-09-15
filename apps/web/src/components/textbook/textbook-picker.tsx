'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import {
  booksForL2,
  summarizeProgress,
  type ProgressSummary,
} from '@langplayer/textbooks';
import { TEXTBOOK_STORAGE_PREFIX, loadPersistedTask } from './task-provider';

/**
 * Textbook picker — the entry screen for `Study > Tasks`.
 *
 * Only one textbook exists today, so this is a single-item list. It exists now
 * so that adding a second book is a content change rather than a navigation
 * change.
 *
 * The list is the catalogue filtered to the books that teach this L2 — a book
 * never appears under an L2 it does not teach (SPEC-095 § "Initial L2 scope").
 */
export function TextbookPicker({ l1, l2 }: { l1: string; l2: string }) {
  // Overall progress for the book, from the local per-task state the exercises write.
  const [progress, setProgress] = useState<Record<string, ProgressSummary>>({});
  const books = booksForL2(l2);

  useEffect(() => {
    // Counted from the local state itself rather than loading the book: the picker
    // renders before any task is opened, and a book's content is a lazy chunk.
    const next: Record<string, ProgressSummary> = {};
    for (const entry of books) {
      const states = Object.keys(window.localStorage)
        .filter((key) => key.startsWith(`${TEXTBOOK_STORAGE_PREFIX}${entry.id}.`))
        .map((key) => loadPersistedTask(key.slice(TEXTBOOK_STORAGE_PREFIX.length)));
      next[entry.id] = summarizeProgress(states, entry.taskCount);
    }
    setProgress(next);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-1">
      <ul className="flex flex-col gap-2">
        {books.map((book) => (
          <li key={book.id}>
            <Link
              href={`/${l1}/${l2}/tasks/${book.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
            >
              <BookOpen size={18} className="shrink-0 text-muted-foreground" />
              <span className="flex-1 text-foreground">{book.title}</span>
              {progress[book.id] && progress[book.id]!.total > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {progress[book.id]!.complete}/{progress[book.id]!.total}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
