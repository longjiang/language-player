import { notFound } from 'next/navigation';
import { loadBook } from '@langplayer/textbooks';

/**
 * Empty state for a book route with no task selected. The TOC lives in this
 * route's layout, so the pane just shows the book's opening CAN-DO statement.
 */
export default async function BookPage(props: {
  params: Promise<{ l1: string; l2: string; bookId: string }>;
}) {
  const { bookId } = await props.params;
  const book = await loadBook(bookId);
  if (!book) notFound();

  return (
    <p className="text-sm text-muted-foreground">
      {book.units.length > 0
        ? book.units[0]!.lessons[0]?.canDo ?? book.title
        : book.title}
    </p>
  );
}
