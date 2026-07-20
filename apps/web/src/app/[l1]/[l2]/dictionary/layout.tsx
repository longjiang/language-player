'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { useDictionaryContext, DictionaryProvider } from '@/providers/dictionary-provider';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useT } from '@/hooks/use-t';
import { useRouter } from 'next/navigation';
import { PersistentSearchBar } from '@/components/dictionary/persistent-search-bar';
import { SavedWordRow } from '@/components/dictionary/saved-word-row';
import { WordListItem } from '@/components/dictionary/word-list';
import { SaveButton } from '@/components/save-button';
import { buildEntryRoute } from '@/lib/entry-route';
import { decomposeWordId } from '@/lib/word-id-resolver';
import type { WordListNavItem as Wlni } from '@/lib/word-list-navigation';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SavedLexicalItemRecord, DictionaryEntry } from '@langplayer/shared';

// ── Inner layout (needs context, so must be child of DictionaryProvider) ──

function DictionaryLayoutInner({ children }: { children: React.ReactNode }) {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const isDetailPage = pathname.includes('/entry/');

  const {
    results,
    sidebarSource,
    sidebarOpen,
    setSidebarOpen,
    cameFromSearch,
    setCameFromSearch,
    setDetailHead,
    setSidebarSource,
  } = useDictionaryContext();

  const { getSavedWords, loaded: savedLoaded } = useSavedWordsContext();

  const handleResultClick = (item: Wlni) => {
    setDetailHead(item.head);
    const route = buildEntryRoute(l1.code, l2.code, item.dictionaryId, item.entryId);
    router.push(route);
  };

  const handleSavedWordClick = (word: SavedLexicalItemRecord) => {
    const decomposed = decomposeWordId(word.id, l2.code);
    if (!decomposed) return;
    setDetailHead(word.forms[0] ?? '');
    const route = buildEntryRoute(l1.code, l2.code, decomposed.dict, decomposed.id);
    router.push(route);
  };

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
            'flex-shrink-0 transition-all duration-200',
            sidebarOpen ? 'lg:flex-1 lg:min-w-0 w-56 ml-3' : 'w-0 overflow-hidden',
          )}
        >
          <div className="rounded-xl border border-border bg-card h-full flex flex-col overflow-hidden">
            <div className="flex items-center border-b border-border px-3 py-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {sidebarSource.kind === 'results' ? t('msg.result_count', { count: sidebarSource.items.length }) : t('title.saved_words')}
              </h3>
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
              ) : sidebarOpen ? (
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
        </aside>
      </div>
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
    <div className="space-y-0.5">
      {words.map((word) => (
        <SavedWordRow
          key={word.id}
          word={word}
          l1Code={l1Code}
          l2Code={l2Code}
          compact
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

