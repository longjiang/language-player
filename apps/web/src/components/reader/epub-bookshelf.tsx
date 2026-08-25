'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useT } from '@/hooks/use-t';
import { EpubUpload } from '@/components/reader/epub-upload';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BookOpen, Loader2, MoreVertical, Search, Trash2, X } from 'lucide-react';
import type { EpubSummary } from '@/lib/epub-store';
import type { EpubUploadResult } from '@/components/reader/epub-upload';
import { normalizeLanguageCode } from '@/lib/epub-book';
import { displayLanguageName } from '@/lib/language-data';

interface EpubBookshelfProps {
  /** Stored books (metadata only), sorted by last read. */
  books: EpubSummary[];
  /** Current target-language code — the shelf only shows books in it. */
  l2Code: string;
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

/** "..." action menu for a book card: Remove + Cancel. */
function BookActionsMenu({ onRemove }: { onRemove: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('action.more')}
          title={t('action.more')}
          onClick={(e) => e.stopPropagation()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <button
          type="button"
          onClick={() => { setOpen(false); onRemove(); }}
          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-muted"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('action.remove')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
          {t('action.cancel')}
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function EpubBookshelf({
  books,
  l2Code,
  onOpenBook,
  onRemoveBook,
  onFilesProcessed,
  openingId,
  error,
}: EpubBookshelfProps) {
  const t = useT();
  const locale = useLocale();
  const l2Primary = normalizeLanguageCode(l2Code);
  // Localized name in the current UI locale (e.g. 英语 for zh-Hans), so the
  // empty state never shows "No English books" inside a Chinese UI.
  const l2LocalizedName = displayLanguageName(l2Code, locale);
  // Books are tagged with the L2 they were uploaded under — no OPF language
  // sniffing. Only legacy untagged books still show in every language so
  // they can never silently disappear from the shelf.
  const [filter, setFilter] = useState('');
  const visibleBooks = books.filter(
    b => !b.language || normalizeLanguageCode(b.language) === l2Primary,
  );
  // Name filter: case-insensitive match against the file name with the
  // extension stripped, so "Botchan" finds "botchan.epub".
  const q = filter.trim().toLowerCase();
  const filteredBooks = q
    ? visibleBooks.filter((b) => {
        const name = b.fileName.replace(/\.[^.]+$/, '').toLowerCase();
        return name.includes(q) || b.fileName.toLowerCase().includes(q);
      })
    : visibleBooks;

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
      ) : visibleBooks.length === 0 ? (
        <>
          {/* Books exist, but none match the current learning language */}
          <EpubUpload onFilesProcessed={onFilesProcessed} error={error} compact />
          <p className="text-center text-sm text-muted-foreground">
            {t('msg.epub_no_books_in_language', { language: l2LocalizedName })}
          </p>
        </>
      ) : (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">{t('title.my_books')}</h2>

          {/* Filter the shelf by book name */}
          <div className="relative mb-3 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('placeholder.filter_books')}
              aria-label={t('placeholder.filter_books')}
              className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-8 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter('')}
                aria-label={t('action.clear')}
                title={t('action.clear')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {q && filteredBooks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_results')}</p>
          ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {filteredBooks.map(book => {
              const pct = book.totalChars > 0
                ? Math.min(100, Math.round((book.readChars / book.totalChars) * 100))
                : null;
              const displayName = book.fileName.replace(/\.epub$/i, '');
              return (
                <div
                  key={book.id}
                  role="button"
                  tabIndex={0}
                  aria-disabled={openingId !== null}
                  title={book.fileName}
                  onClick={() => { if (openingId === null) onOpenBook(book.id); }}
                  onKeyDown={(e) => {
                    if (openingId !== null) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenBook(book.id);
                    }
                  }}
                  className={`group flex cursor-pointer flex-col items-start gap-2 rounded-lg p-2 transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${openingId !== null ? 'opacity-70' : ''}`}
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

                  {/* Title + "..." action menu */}
                  <div className="flex w-full items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {displayName}
                    </span>
                    <BookActionsMenu onRemove={() => onRemoveBook(book.id)} />
                  </div>

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
                </div>
              );
            })}
            {/* Add-a-book slot — dashed tile after the last book */}
            <EpubUpload onFilesProcessed={onFilesProcessed} error={error} slot />
          </div>
          )}
        </section>
      )}
    </div>
  );
}
