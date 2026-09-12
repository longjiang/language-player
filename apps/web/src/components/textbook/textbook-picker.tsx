'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { TEXTBOOK_CATALOGUE } from '@langplayer/textbooks';

/**
 * Textbook picker — the entry screen for `Study > Tasks`.
 *
 * Only one textbook exists today, so this is a single-item list. It exists now
 * so that adding a second book is a content change rather than a navigation
 * change.
 */
export function TextbookPicker({ l1, l2 }: { l1: string; l2: string }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-1">
      <ul className="flex flex-col gap-2">
        {TEXTBOOK_CATALOGUE.map((book) => (
          <li key={book.id}>
            <Link
              href={`/${l1}/${l2}/tasks/${book.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
            >
              <BookOpen size={18} className="shrink-0 text-muted-foreground" />
              <span className="text-foreground">{book.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
