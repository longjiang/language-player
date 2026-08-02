'use client';

import { useT } from '@/hooks/use-t';
import { EpubUpload } from '@/components/reader/epub-upload';
import { BookOpen, Loader2 } from 'lucide-react';
import type { EpubSummary } from '@/lib/epub-store';

interface EpubBookshelfProps {
  /** Stored books (metadata only), sorted by last read. */
  books: EpubSummary[];
  /** Open a stored book at its saved chapter/page. */
  onOpenBook: (id: string) => void;
  /** Called with decoded contents of every uploaded .epub file. */
  onFilesLoaded: (files: Array<{ data: ArrayBuffer; fileName: string }>) => void;
  /** Id of the book currently being opened (shows a spinner on its card). */
  openingId: string | null;
  /** Error message to display (e.g. parse failure from parent). */
  error?: string | null;
}

export function EpubBookshelf({
  books,
  onOpenBook,
  onFilesLoaded,
  openingId,
  error,
}: EpubBookshelfProps) {
  const t = useT();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto">
      {books.length === 0 ? (
        <>
          {/* Empty library — full-width upload row */}
          <EpubUpload onFilesLoaded={onFilesLoaded} error={error} compact />
          <p className="text-center text-sm text-muted-foreground">
            {t('msg.epub_library_empty')}
          </p>
        </>
      ) : (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">{t('title.my_books')}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {books.map(book => {
              const pct = book.totalChars > 0
                ? Math.min(100, Math.round((book.readChars / book.totalChars) * 100))
                : null;
              const displayName = book.fileName.replace(/\.epub$/i, '');
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => onOpenBook(book.id)}
                  disabled={openingId !== null}
                  title={book.fileName}
                  className="group flex flex-col items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md border border-border bg-muted">
                    {book.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={book.coverUrl}
                        alt={book.fileName}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                    )}
                    {openingId === book.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  <span className="w-full truncate text-sm font-medium text-foreground">
                    {displayName}
                  </span>
                  {pct !== null && (
                    <span className="w-full">
                      <span className="mb-1 block text-xs text-muted-foreground">
                        {t('msg.epub_progress', { pct })}
                      </span>
                      <span className="block h-1 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
            {/* Add-a-book slot — dashed tile after the last book */}
            <EpubUpload onFilesLoaded={onFilesLoaded} error={error} slot />
          </div>
        </section>
      )}
    </div>
  );
}
