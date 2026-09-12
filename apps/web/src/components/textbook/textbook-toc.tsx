'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import {
  bookProgress,
  taskHref,
  type BookProgress,
  type LessonProgress,
  type TaskProgress,
  type TocTree,
} from '@langplayer/textbooks';
import { loadPersistedTask } from './task-provider';

interface TextbookTocProps {
  tree: TocTree;
  l1: string;
  l2: string;
  /** Called after a task link is chosen (used to close a mobile drawer). */
  onNavigate?: () => void;
}

/**
 * Units → lessons → tasks navigation.
 *
 * Mirrors the docs sidebar (`apps/web/src/app/docs/doc-sidebar.tsx`): a group is
 * collapsed by default and expanded when it contains the active item. Units and
 * lessons are the two collapsible levels; tasks are the leaves.
 */
export function TextbookToc({ tree, l1, l2, onNavigate }: TextbookTocProps) {
  const pathname = usePathname();
  // Progress is derived from the same local state the tasks write (ADR-0044). It is
  // recomputed when the route changes, which is when a student could next see it —
  // this layout persists across task navigations.
  const [progress, setProgress] = useState<BookProgress | null>(null);
  useEffect(() => {
    const states = new Map(
      tree.units
        .flatMap((u) => u.lessons.flatMap((l) => l.tasks))
        .map((task) => [task.id, loadPersistedTask(task.id)] as const),
    );
    setProgress(bookProgress(tree, states));
  }, [tree, pathname]);

  const lessonProgress = useMemo(() => {
    const map = new Map<string, LessonProgress>();
    const tasks = new Map<string, TaskProgress>();
    for (const unit of progress?.units ?? []) {
      for (const lesson of unit.lessons) {
        map.set(`${unit.unitId}/${lesson.lessonId}`, lesson);
        for (const task of lesson.tasks) tasks.set(task.taskId, task);
      }
    }
    return { lessons: map, tasks };
  }, [progress]);
  // The active task is read from the URL so this can live in the layout, which
  // does not receive the child route's params.
  const currentTaskId = tree.units
    .flatMap((u) => u.lessons.flatMap((l) => l.tasks))
    .map((task) => task.id)
    .find((id) => pathname === taskHref(l1, l2, id));
  const activeLessonKey = currentTaskId
    ? tree.units
        .flatMap((u) => u.lessons.map((l) => ({ unitId: u.id, lessonId: l.id, tasks: l.tasks })))
        .find((l) => l.tasks.some((task) => task.id === currentTaskId))
    : undefined;

  const activeUnitId = activeLessonKey?.unitId;

  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>(
    activeUnitId ? { [activeUnitId]: true } : {},
  );
  const [openLessons, setOpenLessons] = useState<Record<string, boolean>>(
    activeLessonKey ? { [`${activeLessonKey.unitId}/${activeLessonKey.lessonId}`]: true } : {},
  );

  const isUnitOpen = (unitId: string) => openUnits[unitId] ?? unitId === activeUnitId;
  const isLessonOpen = (unitId: string, lessonId: string) =>
    openLessons[`${unitId}/${lessonId}`] ??
    (unitId === activeLessonKey?.unitId && lessonId === activeLessonKey?.lessonId);

  return (
    <nav aria-label={tree.bookTitle} className="flex flex-col gap-1 text-sm">
      <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {tree.bookTitle}
      </p>

      {tree.units.map((unit) => {
        const unitOpen = isUnitOpen(unit.id);
        return (
          <div key={unit.id}>
            <button
              type="button"
              onClick={() => setOpenUnits((s) => ({ ...s, [unit.id]: !unitOpen }))}
              aria-expanded={unitOpen}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-foreground hover:bg-muted"
            >
              <ChevronDown
                size={14}
                className={`shrink-0 text-muted-foreground transition-transform ${unitOpen ? '' : '-rotate-90'}`}
              />
              <span className="font-medium">
                {unit.number}. {unit.title}
              </span>
            </button>

            {unitOpen && (
              <div className="ml-3 flex flex-col">
                {unit.lessons.map((lesson) => {
                  const lessonOpen = isLessonOpen(unit.id, lesson.id);
                  const lessonStat = lessonProgress.lessons.get(`${unit.id}/${lesson.id}`);
                  return (
                    <div key={lesson.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenLessons((s) => ({
                            ...s,
                            [`${unit.id}/${lesson.id}`]: !lessonOpen,
                          }))
                        }
                        aria-expanded={lessonOpen}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-foreground hover:bg-muted"
                      >
                        <ChevronDown
                          size={14}
                          className={`shrink-0 text-muted-foreground transition-transform ${lessonOpen ? '' : '-rotate-90'}`}
                        />
                        <span className="flex-1">
                          {lesson.letter}. {lesson.title}
                        </span>
                        {lessonStat && lessonStat.attempted > 0 && (
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {lessonStat.complete}/{lessonStat.total}
                          </span>
                        )}
                      </button>

                      {lessonOpen && (
                        <ul className="ml-4 flex flex-col">
                          {lesson.tasks.map((task) => {
                            const active = task.id === currentTaskId;
                            return (
                              <li key={task.id}>
                                <Link
                                  href={taskHref(l1, l2, task.id)}
                                  onClick={onNavigate}
                                  aria-current={active ? 'page' : undefined}
                                  className={`flex items-center gap-2 rounded px-2 py-1.5 transition-colors ${
                                    active
                                      ? 'bg-primary/10 font-medium text-primary'
                                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                  }`}
                                >
                                  <span aria-hidden>{task.number}</span>
                                  {task.type && (
                                    <span className="text-xs opacity-70">{task.type}</span>
                                  )}
                                  <TaskMark progress={lessonProgress.tasks.get(task.id)} />
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * A task's state in the TOC: a tick once it is fully correct, a dot once attempted,
 * nothing otherwise. Attempted-but-not-complete is deliberately distinguishable —
 * "I tried this" is the thing a student wants to find again.
 */
function TaskMark({ progress }: { progress?: TaskProgress }) {
  if (!progress?.attempted) return null;
  return (
    <span
      className="ml-auto shrink-0 text-xs"
      title={progress.complete ? 'complete' : 'attempted'}
      aria-label={progress.complete ? 'complete' : 'attempted'}
    >
      {progress.complete ? (
        <span className="text-primary" aria-hidden>
          ✓
        </span>
      ) : (
        <span className="text-muted-foreground" aria-hidden>
          •
        </span>
      )}
    </span>
  );
}
