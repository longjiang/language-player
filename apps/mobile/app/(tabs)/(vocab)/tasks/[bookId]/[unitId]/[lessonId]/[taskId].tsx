import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TaskView } from '@/components/textbook/TaskView';

/**
 * One task: the workbook's numbered activity, rendered interactively.
 *
 * Route segments are the reverse of the canonical task id
 * (`tblt-hsk4.u06.B.t2` → `.../tblt-hsk4/u06/B/t2`), and `TaskView` resolves the
 * task and shows a not-found state if the URL does not match one.
 */
export default function TaskScreen() {
  const { bookId, unitId, lessonId, taskId } = useLocalSearchParams<{
    bookId: string;
    unitId: string;
    lessonId: string;
    taskId: string;
  }>();

  return (
    <TaskView bookId={bookId} unitId={unitId} lessonId={lessonId} taskId={taskId} />
  );
}
