import { notFound } from 'next/navigation';
import { findTask, loadBook } from '@langplayer/textbooks';
import { TaskView } from '@/components/textbook/task-view';

/**
 * One task: the workbook's numbered activity, rendered interactively.
 *
 * The book is loaded to resolve the task and to carry its content version; the
 * route segments are the reverse of the canonical task id
 * (`tblt-hsk4.u06.B.t2` → `/tblt-hsk4/u06/B/t2`).
 *
 * The book must teach the route's L2 as well as exist: `/xx/ja/tasks/tblt-hsk4/...`
 * is a 404, not the Chinese task (SPEC-095 § "Initial L2 scope").
 */
export default async function TaskPage(props: {
  params: Promise<{
    l1: string;
    l2: string;
    bookId: string;
    unitId: string;
    lessonId: string;
    taskId: string;
  }>;
}) {
  const { l2, bookId, unitId, lessonId, taskId } = await props.params;

  const book = await loadBook(bookId);
  if (!book || book.l2 !== l2) notFound();

  // Broken or hand-edited URL: resolve defensively so an unknown task is a 404
  // rather than an exception.
  const lesson = book.units
    .find((u) => u.id === unitId)
    ?.lessons.find((l) => l.id === lessonId);
  if (!lesson) notFound();

  const task = findTask(book, `${bookId}.${unitId}.${lessonId}.${taskId}`);
  if (!task) notFound();

  return <TaskView book={book} task={task} />;
}
