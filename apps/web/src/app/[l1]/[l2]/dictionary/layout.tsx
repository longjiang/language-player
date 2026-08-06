'use client';

import { Suspense } from 'react';
import { useDictionaryContext, DictionaryProvider } from '@/providers/dictionary-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRouter } from 'next/navigation';
import { PersistentSearchBar } from '@/components/dictionary/persistent-search-bar';
import { WordListSidebar } from '@/components/dictionary/word-list-sidebar';
import { buildEntryRouteWithList, entryToNavItem, replaceNavItem, updateCurrentEntryId } from '@/lib/word-list-navigation';
import type { WordListNavItem as Wlni } from '@/lib/word-list-navigation';
import type { DictionaryEntry } from '@langplayer/shared';

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

  const handleResultClick = (item: Wlni, entry?: DictionaryEntry) => {
    // A search-fallback item that has since resolved to a real entry: route to
    // it and upgrade the stored list item to its real id, keeping the list
    // intact so the sidebar doesn't get lost.
    if (item.dictionaryId === 'unknown' && entry) {
      const real = entryToNavItem(entry);
      setDetailHead(item.head);
      setMobileSidebarOpen(false);
      replaceNavItem(item.id, real, real.id);
      router.push(buildEntryRouteWithList(l1.code, l2.code, real.dictionaryId, real.entryId, real.id));
      return;
    }
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
          l1Code={l1.code}
          l2Code={l2.code}
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
