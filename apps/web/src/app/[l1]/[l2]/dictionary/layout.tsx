'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { useDictionaryContext, DictionaryProvider } from '@/providers/dictionary-provider';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useT } from '@/hooks/use-t';
import { useRouter } from 'next/navigation';
import { PersistentSearchBar } from '@/components/dictionary/persistent-search-bar';
import { SavedWordEntryCard } from '@/components/dictionary/saved-word-entry-card';
import { WordListItem } from '@/components/dictionary/word-list';
import { SaveButton } from '@/components/save-button';
import { buildEntryRoute } from '@/lib/entry-route';
import { decomposeWordId } from '@langplayer/shared';
import type { WordListNavItem as Wlni } from '@/lib/word-list-navigation';
import { BookOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SavedLexicalItemRecord, DictionaryEntry } from '@langplayer/shared';
import { Sheet, SheetContent } from '@/components/ui/sheet';

// ── Inner layout (needs context, so must be child of DictionaryProvider) ──

function DictionaryLayoutInner({ children }: { children: React.ReactNode }) {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const isDetailPage = pathname.includes('/entry/');

  const {
    sidebarSource,
    sidebarOpen,
    setSidebarOpen,
    cameFromSearch,
    setCameFromSearch,
    setDetailHead,
    setSidebarSource,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useDictionaryContext();

  const { getSavedWords, loaded: savedLoaded } = useSavedWordsContext();

  const handleResultClick = (item: Wlni) => {
    setDetailHead(item.head);
    setMobileSidebarOpen(false);
    const route = buildEntryRoute(l1.code, l2.code, item.dictionaryId, item.entryId);
    router.push(route);
  };

  const handleSavedWordClick = (word: SavedLexicalItemRecord) => {
    const decomposed = decomposeWordId(word.id, l2.code);
    if (!decomposed) return;
    setDetailHead(word.forms[0] ?? '');
    setMobileSidebarOpen(false);
    const route = buildEntryRoute(l1.code, l2.code, decomposed.dict, decomposed.id);
    router.push(route);
  };

  // Shared sidebar panel — rendered in the desktop aside and the mobile sheet.
  const renderSidebarPanel = (onClose?: () => void) => (
    <div className="rounded-xl border border-border bg-card h-full flex flex-col overflow-hidden">
      <div className="flex items-center border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {sidebarSource.kind === 'results' ? t('msg.result_count', { count: sidebarSource.items.length }) : t('title.saved_words')}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={t('action.close')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {sidebarSource.kind === 'saved' && savedLoaded ? (
          <SavedWordsSidebarContent
            l2Code={l2.code}
            l1Code={l1.code}
            getSavedWords={getSavedWords}
            onWordClick={handleSavedWordClick}
            currentEntryId={isDetailPage ? (() => {
              const parts = pathname.split('/');
              const dIdx = parts.indexOf('entry') + 1;
              const eIdx = dIdx + 1;
              const d = parts[dIdx] ?? '';
              const e = parts[eIdx] ? decodeURIComponent(parts[eIdx]).replace(/~/g, ',') : '';
              return `${d}-${e}`;
            })() : null}
          />
        ) : sidebarSource.kind === 'results' && sidebarSource.items.length > 0 ? (
          <div className="space-y-0.5">
            {sidebarSource.items.map((e) => {
              const compositeId = `${e.dictionary?.id ?? 'llm'}-${e.id}`;
              const parts = pathname.split('/');
              const dIdx = parts.indexOf('entry') + 1;
              const eIdx = dIdx + 1;
              const d = parts[dIdx] ?? '';
              const entry = parts[eIdx] ? decodeURIComponent(parts[eIdx]).replace(/~/g, ',') : '';
              const isActive = `${d}-${entry}` === compositeId;
              return (
                <WordListItem
                  key={compositeId}
                  head={e.head}
                  prefix={
                    <div onClick={(ev) => ev.stopPropagation()} className="-m-1">
                      <SaveButton
                        wordId={e.id}
                        head={e.head}
                        context={{
                          form: e.head,
                          text: e.head,
                          textTitle: 'Dictionary',
                        }}
                        size="icon"
                      />
                    </div>
                  }
                  definitionSlot={
                    (e.pronunciation || e.definitions?.length) ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                        {e.pronunciation && <span className="mr-1.5 text-muted-foreground/50">{e.pronunciation}</span>}
                        {e.definitions?.length ? <span>{e.definitions.join('; ')}</span> : null}
                      </p>
                    ) : undefined
                  }
                  compact
                  onClick={() => handleResultClick({
                    head: e.head,
                    dictionaryId: e.dictionary?.id ?? 'llm',
                    entryId: e.id,
                    id: compositeId,
                  })}
                />
              );
            })}
          </div>
        ) : (sidebarOpen || onClose) ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-4">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-xs text-muted-foreground">
                {savedLoaded ? t('msg.no_saved_words') : t('msg.loading')}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-3 flex flex-col" style={{ height: 'calc(100vh - var(--header-height, 64px))' }}>
      {/* Persistent search bar */}
      <PersistentSearchBar />

      {/* Panel area */}
      <div className="flex flex-1 min-h-0">
        {/* Main panel */}
        <div className="flex-[3] min-w-0 overflow-y-auto">
          {children}
        </div>

        {/* Sidebar */}
        <aside
          className={cn(
            'hidden lg:flex flex-shrink-0 transition-all duration-200',
            sidebarOpen ? 'lg:flex-1 lg:min-w-0 w-56 ml-3' : 'lg:w-0 overflow-hidden',
          )}
        >
          {renderSidebarPanel()}
        </aside>
      </div>

      {/* Mobile: sidebar as a slide-in sheet overlay */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent
          side="right"
          className="w-80 max-w-[85vw] p-0 border-l-0 ring-0"
          showCloseButton={false}
        >
          {renderSidebarPanel(() => setMobileSidebarOpen(false))}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Saved Words sidebar content ──────────────

function SavedWordsSidebarContent({
  l2Code,
  l1Code,
  getSavedWords,
  onWordClick,
  currentEntryId,
}: {
  l2Code: string;
  l1Code: string;
  getSavedWords: (l2: string) => SavedLexicalItemRecord[];
  onWordClick: (word: SavedLexicalItemRecord) => void;
  currentEntryId: string | null;
}) {
  const t = useT();
  const words = getSavedWords(l2Code);

  if (words.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground px-3 py-4">{t('msg.no_saved_words')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2">
      {words.map((word) => (
        <SavedWordEntryCard
          key={word.id}
          word={word}
          l1Code={l1Code}
          l2Code={l2Code}
          onClick={() => onWordClick(word)}
        />
      ))}
    </div>
  );
}

// ── Outer layout (Suspense boundary for useSearchParams) ──

export default function DictionaryLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <DictionaryProvider>
        <DictionaryLayoutInner>{children}</DictionaryLayoutInner>
      </DictionaryProvider>
    </Suspense>
  );
}
