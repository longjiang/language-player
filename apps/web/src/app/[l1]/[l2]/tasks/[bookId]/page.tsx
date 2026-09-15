import { notFound } from 'next/navigation';
import { buildTocTree, loadBook } from '@langplayer/textbooks';
import { TextbookTocList } from '@/components/textbook/textbook-toc-list';

/**
 * A book's own page: its full table of contents — units → lessons → tasks, with the
 * CAN-DO statement each lesson teaches toward and the student's progress on each.
 *
 * This is the page the student lands on after choosing a book, and it mirrors the
 * docs index: the whole tree is visible and every leaf is a link, so the book's
 * contents can be read before deciding where to start. The collapsible sidebar
 * belongs to the task view beside it (`textbook-toc-sidebar.tsx`) and is not shown
 * here — the same list twice on one screen is the same information twice.
 */
export default async function BookPage(props: {
  params: Promise<{ l1: string; l2: string; bookId: string }>;
}) {
  const { l1, l2, bookId } = await props.params;
  const book = await loadBook(bookId);
  // A book is only served under the L2 it teaches (SPEC-095 § "Initial L2 scope").
  if (!book || book.l2 !== l2) notFound();

  // `buildTocTree` strips task bodies, so the whole book — including every answer —
  // is not serialised to the client just to draw the list.
  return <TextbookTocList tree={buildTocTree(book)} l1={l1} l2={l2} />;
}
