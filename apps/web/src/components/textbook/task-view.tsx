'use client';

import React from 'react';
import type { BookMeta, Task } from '@langplayer/textbooks';
import { TextbookTaskProvider } from './task-provider';
import { TaskSyncBridge } from './task-sync-bridge';
import { TaskShell, TaskStimulus } from './task-shell';

/**
 * Renders one task: provider (response store + persistence) → shell (frame,
 * instructions, controls) → stimuli (the task's own body).
 */
export function TaskView({ book, task }: { book: BookMeta; task: Task }) {
  return (
    <TextbookTaskProvider task={task} book={book}>
      {/* Server sync lives inside the provider so it can adopt into its store. */}
      <TaskSyncBridge />
      <TaskShell>
        <TaskStimulus />
      </TaskShell>
    </TextbookTaskProvider>
  );
}
