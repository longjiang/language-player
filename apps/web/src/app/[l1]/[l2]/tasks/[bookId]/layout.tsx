import { notFound } from 'next/navigation';
import { buildTocTree, loadBook } from '@langplayer/textbooks';
import { TextbookTocSidebar } from '@/components/textbook/textbook-toc-sidebar';

/**
 * The docs-style layout: the task in the main pane, the unit → lesson → task TOC
 * in a collapsible sidebar on the right.
 *
 * The sidebar renders only on a task route. Opening a book shows its full TOC list
 * as the page itself, and the docs UI — which this mirrors — does not repeat the
 * list in a second column next to itself.
 *
 * The TOC lives here rather than on the top `tasks` layout because it needs the
 * book to build the tree, and the picker at `tasks/page.tsx` must render without a
 * sidebar: it has not chosen a book yet.
 */
export default async function BookLayout(props: {
  children: React.ReactNode;
  params: Promise<{ l1: string; l2: string; bookId: string }>;
}) {
  const { l1, l2, bookId } = await props.params;
  const book = await loadBook(bookId);
  if (!book) notFound();

  // The TOC needs ids and titles only — `buildTocTree` strips task bodies so
  // the whole book (including every answer) is not serialised to the client.
  const tree = buildTocTree(book);

  return (
    <div className="mx-auto flex w-full max-w-6xl justify-center gap-8">
      <div className="min-w-0 max-w-3xl flex-1">{props.children}</div>
      <TextbookTocSidebar tree={tree} l1={l1} l2={l2} />
    </div>
  );
}
