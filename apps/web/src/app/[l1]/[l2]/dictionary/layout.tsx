'use client';

import { Suspense } from 'react';
import { useDictionaryContext, DictionaryProvider } from '@/providers/dictionary-provider';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useRouter } from 'next/navigation';
import { PersistentSearchBar } from '@/components/dictionary/persistent-search-bar';
import { WordListSidebar } from '@/components/dictionary/word-list-sidebar';
import { buildEntryRoute } from '@/lib/entry-route';
import { decomposeWordId } from '@langplayer/shared';
import type { WordListNavItem as Wlni } from '@/lib/word-list-navigation';
import type { SavedLexicalItemRecord } from '@langplayer/shared';

// ── Inner layout (needs context, so must be child of DictionaryProvider) ──

function DictionaryLayoutInner({ children }: { children: React.ReactNode }) {
  const { l1, l2 } = useLanguage();
  const router = useRouter();

  const {
    sidebarSource,
    sidebarOpen,
    setDetailHead,
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
        <WordListSidebar
          open={mobileSidebarOpen}
          onOpenChange={setMobileSidebarOpen}
          sidebarOpen={sidebarOpen}
          source={sidebarSource}
          savedLoaded={savedLoaded}
          getSavedWords={getSavedWords}
          l1Code={l1.code}
          l2Code={l2.code}
          onResultClick={handleResultClick}
          onSavedWordClick={handleSavedWordClick}
        />
      </div>
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
