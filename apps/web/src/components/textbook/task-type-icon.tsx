'use client';

import React from 'react';
import { BookOpen, Headphones, MessagesSquare, PenLine } from 'lucide-react';
import type { TaskType } from '@langplayer/textbooks';
import { taskTypeKey } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';

/**
 * A task's type as an icon.
 *
 * The type used to be printed as its own name — `listening` — which read as stray
 * English inside an otherwise Chinese TOC and told the student nothing the icon
 * does not say faster. The name is not lost: it becomes the icon's `title` and a
 * visually hidden label, so screen readers and hover still get it, localized.
 *
 * `type` is optional on a task, and an unknown type renders nothing: a missing
 * icon must never push the row's number and progress mark out of alignment.
 */
const TASK_TYPE_ICONS: Record<TaskType, React.ComponentType<{ className?: string; title?: string }>> = {
  listening: Headphones,
  reading: BookOpen,
  conversation: MessagesSquare,
  writing: PenLine,
};

export function TaskTypeIcon({ type, className }: { type?: TaskType; className?: string }) {
  const t = useT();
  if (!type) return null;
  const Icon = TASK_TYPE_ICONS[type];
  if (!Icon) return null;
  const label = t(taskTypeKey(type) as never);
  return (
    <>
      <Icon className={className} title={label} aria-hidden />
      <span className="sr-only">{label}</span>
    </>
  );
}
