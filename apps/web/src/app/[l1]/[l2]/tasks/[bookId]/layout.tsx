import { notFound } from 'next/navigation';
import { buildTocTree, loadBook } from '@langplayer/textbooks';
import { TextbookToc } from '@/components/textbook/textbook-toc';

/**
 * The docs-style layout: the unit → lesson → task TOC in a sidebar, with the
 * selected task (or an empty state) in the main pane.
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row">
      <aside className="lg:w-64 lg:shrink-0">
        <TextbookToc tree={tree} l1={l1} l2={l2} />
      </aside>
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}
