'use client';

import { useT } from '@/hooks/use-t';
import { EpubUpload } from '@/components/reader/epub-upload';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BookOpen, Loader2, MoreVertical, Trash2 } from 'lucide-react';
import type { EpubSummary } from '@/lib/epub-store';
import type { EpubUploadResult } from '@/components/reader/epub-upload';

interface EpubBookshelfProps {
  /** Stored books (metadata only), sorted by last read. */
  books: EpubSummary[];
  /** Open a stored book at its saved chapter/page. */
  onOpenBook: (id: string) => void;
  /** Remove a book from the shelf (deletes its stored handle). */
  onRemoveBook: (id: string) => void;
  /** Called with readable .epub files plus any files that failed up front. */
  onFilesProcessed: (result: EpubUploadResult) => void;
  /** Id of the book currently being opened (shows a spinner on its card). */
  openingId: string | null;
  /** Error message to display (e.g. parse failure from parent). */
  error?: string | null;
}

export function EpubBookshelf({
  books,
  onOpenBook,
  onRemoveBook,
  onFilesProcessed,
  openingId,
  error,
}: EpubBookshelfProps) {
  const t = useT();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto">
      {books.length === 0 ? (
        <>
          {/* Empty library — full-width upload row */}
          <EpubUpload onFilesProcessed={onFilesProcessed} error={error} compact />
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
                <div
                  key={book.id}
                  className="group relative flex flex-col items-start gap-2 rounded-lg p-2 transition-colors hover:bg-muted/60"
                >
                  <button
                    type="button"
                    onClick={() => onOpenBook(book.id)}
                    disabled={openingId !== null}
                    title={book.fileName}
                    className="flex w-full flex-col items-start gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70"
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

                  {/* "..." action menu */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('action.more')}
                        title={t('action.more')}
                        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-background/70 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-44 p-1">
                      <button
                        type="button"
                        onClick={() => onRemoveBook(book.id)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-muted"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('action.remove')}
                      </button>
                    </PopoverContent>
                  </Popover>
                </div>
              );
            })}
            {/* Add-a-book slot — dashed tile after the last book */}
            <EpubUpload onFilesProcessed={onFilesProcessed} error={error} slot />
          </div>
        </section>
      )}
    </div>
  );
}
