'use client';

import { Suspense } from 'react';
import { useDictionaryContext, DictionaryProvider } from '@/providers/dictionary-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRouter } from 'next/navigation';
import { PersistentSearchBar } from '@/components/dictionary/persistent-search-bar';
import { WordListSidebar } from '@/components/dictionary/word-list-sidebar';
import { buildEntryRouteWithList, updateCurrentEntryId } from '@/lib/word-list-navigation';
import type { WordListNavItem as Wlni } from '@/lib/word-list-navigation';

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

  const handleResultClick = (item: Wlni) => {
    // Legacy saved words with an unresolvable id fall back to a search.
    if (item.dictionaryId === 'unknown') {
      router.push(`/${l1.code}/${l2.code}/dictionary?q=${encodeURIComponent(item.head)}`);
      return;
    }
    setDetailHead(item.head);
    setMobileSidebarOpen(false);
    // Navigate within the same source list so the sidebar stays available.
    updateCurrentEntryId(item.id);
    router.push(buildEntryRouteWithList(l1.code, l2.code, item.dictionaryId, item.entryId, item.id));
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
          onResultClick={handleResultClick}
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
