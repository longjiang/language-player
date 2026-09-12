'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, Layers } from 'lucide-react';
import { taskHref, type TocTree } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { TaskTypeIcon } from './task-type-icon';
import { TaskMark, useBookProgress, useProgressIndex } from './textbook-toc';

/**
 * A book's whole table of contents, as the page you get when you open the book.
 *
 * Mirrors the docs index (`apps/web/src/app/docs/page.tsx` → `DocList`): every
 * level is visible at once, nested by indentation rather than hidden behind
 * disclosure triangles, and each leaf is a link. The sidebar keeps the collapsible
 * form, because there the tree is navigation beside content the student is reading;
 * here the tree *is* the content, and asking a student to expand five lessons one at
 * a time to see what a book contains is what made the old page useless — it showed
 * one CAN-DO sentence and nothing else.
 *
 * Progress is the same roll-up the sidebar shows, from the same local store
 * (ADR-0044), so a book reads as "12 / 25" and each finished task carries its tick.
 */
export function TextbookTocList({
  tree,
  l1,
  l2,
}: {
  tree: TocTree;
  l1: string;
  l2: string;
}) {
  const t = useT();
  const progress = useBookProgress(tree);
  const index = useProgressIndex(progress);

  // The roll-up already counts what was attempted and what is complete; a per-task
  // sweep of the index would be a second implementation of the same arithmetic.
  const bookStat = progress && progress.total > 0 ? progress : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{tree.bookTitle}</h1>
        {bookStat && bookStat.complete > 0 && (
          <p className="text-sm tabular-nums text-muted-foreground">
            {bookStat.complete}/{bookStat.total}
          </p>
        )}
      </header>

      <ul className="flex flex-col gap-6">
        {tree.units.map((unit) => {
          const unitStat = progress?.units.find((u) => u.unitId === unit.id);
          return (
            <li key={unit.id}>
              <div className="flex items-center gap-3 px-2 py-1.5">
                <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-sm font-semibold text-foreground">
                  {unit.number}. {unit.title}
                </span>
                {unitStat && unitStat.attempted > 0 && (
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {unitStat.complete}/{unitStat.total}
                  </span>
                )}
              </div>

              <div className="ml-4 flex flex-col gap-4 border-l border-border/50 pl-4">
                {unit.lessons.map((lesson) => {
                  const lessonStat = index.lessons.get(`${unit.id}/${lesson.id}`);
                  return (
                    <div key={lesson.id} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-3 px-2 py-1">
                        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="text-sm text-foreground">
                          {lesson.letter}. {lesson.title}
                        </span>
                        {lessonStat && lessonStat.attempted > 0 && (
                          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                            {lessonStat.complete}/{lessonStat.total}
                          </span>
                        )}
                      </div>
                      {lesson.canDo && (
                        <p className="px-2 pb-1 text-xs text-muted-foreground">{lesson.canDo}</p>
                      )}

                      <ul className="flex flex-col">
                        {lesson.tasks.map((task) => (
                          <li key={task.id}>
                            <Link
                              href={taskHref(l1, l2, task.id)}
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <TaskTypeIcon
                                type={task.type}
                                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              />
                              <span>{t('label.task_number', { number: task.number })}</span>
                              <TaskMark progress={index.tasks.get(task.id)} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
