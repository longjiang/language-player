'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { useDictionaryContext, DictionaryProvider } from '@/providers/dictionary-provider';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { normalizeInstances } from '@/hooks/use-saved-words';
import { useT } from '@/hooks/use-t';
import { useRouter } from 'next/navigation';
import { PersistentSearchBar } from '@/components/dictionary/persistent-search-bar';
import { WordListSidebar } from '@/components/dictionary/word-list-sidebar';
import { InlineDefinition } from '@/components/dictionary/inline-definition';
import { buildEntryRoute } from '@/lib/entry-route';
import type { WordListNavItem as Wlni } from '@/lib/word-list-navigation';
import { BookOpen, BookmarkCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SavedLexicalItemRecord } from '@langplayer/shared';

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

  const { getSavedWords, loaded: savedLoaded, removeSavedWord } = useSavedWordsContext();

  const handleResultClick = (item: Wlni) => {
    setDetailHead(item.head);
    const route = buildEntryRoute(l1.code, l2.code, item.dictionaryId, item.entryId);
    router.push(route);
  };

  const handleSavedWordClick = (word: SavedLexicalItemRecord) => {
    const dashIdx = word.id.indexOf('-');
    const dictId = dashIdx > 0 ? word.id.slice(0, dashIdx) : 'llm';
    const entryId = dashIdx > 0 ? word.id.slice(dashIdx + 1) : word.id;
    setDetailHead(word.forms[0] ?? '');
    const route = buildEntryRoute(l1.code, l2.code, dictId, entryId);
    router.push(route);
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - var(--header-height, 64px))' }}>
      {/* Persistent search bar */}
      <PersistentSearchBar />

      {/* Panel area */}
      <div className="flex flex-1 min-h-0">
        {/* Main panel */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="rounded-xl border border-border bg-card m-2 mr-1 h-full overflow-y-auto">
            {children}
          </div>
        </div>

        {/* Sidebar */}
        <aside
          className={cn(
            'flex-shrink-0 transition-all duration-200 m-2 ml-1',
            sidebarOpen ? 'w-56' : 'w-0 overflow-hidden',
          )}
        >
          <div className="rounded-xl border border-border bg-card h-full flex flex-col overflow-hidden">
            <div className="flex items-center border-b border-border px-3 py-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('title.saved_words')}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto px-1 py-1">
              {sidebarSource.kind === 'saved' && savedLoaded ? (
                <SavedWordsSidebarContent
                  l2Code={l2.code}
                  l1Code={l1.code}
                  getSavedWords={getSavedWords}
                  removeSavedWord={removeSavedWord}
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
                <WordListSidebar
                  items={sidebarSource.items.map((e) => ({
                    head: e.head,
                    dictionaryId: e.dictionary?.id ?? 'llm',
                    entryId: e.id,
                    id: `${e.dictionary?.id ?? 'llm'}-${e.id}`,
                    pronunciation: e.pronunciation || undefined,
                    definition: e.definitions?.[0] || undefined,
                  }))}
                  currentEntryId={(() => {
                    const parts = pathname.split('/');
                    const dIdx = parts.indexOf('entry') + 1;
                    const eIdx = dIdx + 1;
                    const d = parts[dIdx] ?? '';
                    const e = parts[eIdx] ? decodeURIComponent(parts[eIdx]).replace(/~/g, ',') : '';
                    return `${d}-${e}`;
                  })()}
                  open={sidebarOpen}
                  onItemClick={handleResultClick}
                />
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
  removeSavedWord,
  onWordClick,
  currentEntryId,
}: {
  l2Code: string;
  l1Code: string;
  getSavedWords: (l2: string) => SavedLexicalItemRecord[];
  removeSavedWord: (l2: string, wordId: string) => void;
  onWordClick: (word: SavedLexicalItemRecord) => void;
  currentEntryId: string | null;
}) {
  const words = getSavedWords(l2Code);

  if (words.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground px-3 py-4">No saved words yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {words.map((word) => {
        const insts = normalizeInstances(word);
        const latest = insts[insts.length - 1];
        const ctx = latest?.context ?? word.context;
        const isActive = currentEntryId === word.id;

        return (
          <div
            key={word.id}
            className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer hover:bg-muted ${isActive ? 'bg-primary/10 text-primary font-medium' : ''}`}
            onClick={() => onWordClick(word)}
            title={word.forms[0]}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-semibold truncate ${isActive ? 'text-primary' : ''}`} lang={l2Code}>
                  {word.forms[0] ?? '?'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSavedWord(l2Code, word.id); }}
                  className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                  title="Remove from saved words"
                >
                  <BookmarkCheck className="h-4 w-4" />
                </button>
              </div>
              <InlineDefinition wordId={word.id} l1Code={l1Code} l2Code={l2Code} />
            </div>
          </div>
        );
      })}
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

