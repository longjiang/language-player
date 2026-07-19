'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { useDictionaryContext, DictionaryProvider } from '@/providers/dictionary-provider';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useT } from '@/hooks/use-t';
import { useRouter } from 'next/navigation';
import { PersistentSearchBar } from '@/components/dictionary/persistent-search-bar';
import { WordListSidebar } from '@/components/dictionary/word-list-sidebar';
import { buildEntryRoute } from '@/lib/entry-route';
import type { WordListNavItem } from '@/lib/word-list-navigation';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  savedWordToNavItem,
  type WordListNavItem as Wlni,
} from '@/lib/word-list-navigation';

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

  // Resolve sidebar items based on sidebarSource
  const sidebarItems = ((): { items: Wlni[]; currentId: string | null } | null => {
    // On detail page reached from search: show search results in sidebar
    if (isDetailPage && sidebarSource.kind === 'results') {
      const items = sidebarSource.items.map((e) => ({
        head: e.head,
        dictionaryId: e.dictionary?.id ?? 'llm',
        entryId: e.id,
        id: `${e.dictionary?.id ?? 'llm'}-${e.id}`,
        pronunciation: e.pronunciation || undefined,
        definition: e.definitions?.[0] || undefined,
      }));
      // Find current entry ID from URL
      const pathParts = pathname.split('/');
      const dictIdIdx = pathParts.indexOf('entry') + 1;
      const entryIdIdx = dictIdIdx + 1;
      const dictId = pathParts[dictIdIdx] ?? '';
      const entryId = pathParts[entryIdIdx] ? decodeURIComponent(pathParts[entryIdIdx]).replace(/~/g, ',') : '';
      const currentId = `${dictId}-${entryId}`;
      return { items, currentId };
    }

    // On detail page reached from saved words sidebar: show saved words
    if (isDetailPage && sidebarSource.kind === 'saved' && savedLoaded) {
      const words = getSavedWords(l2.code);
      if (words.length > 0) {
        const items = words.map(savedWordToNavItem);
        const pathParts = pathname.split('/');
        const dictIdIdx = pathParts.indexOf('entry') + 1;
        const entryIdIdx = dictIdIdx + 1;
        const dictId = pathParts[dictIdIdx] ?? '';
        const entryId = pathParts[entryIdIdx] ? decodeURIComponent(pathParts[entryIdIdx]).replace(/~/g, ',') : '';
        const currentId = `${dictId}-${entryId}`;
        return { items, currentId };
      }
    }

    // Default: show saved words in sidebar
    if (sidebarSource.kind === 'saved' && savedLoaded) {
      const words = getSavedWords(l2.code);
      if (words.length > 0) {
        return { items: words.map(savedWordToNavItem), currentId: null };
      }
    }

    return null;
  })();

  const handleSidebarWordClick = (item: Wlni) => {
    // If we came from search results, maintain the cameFromSearch flag
    // so the back button is shown on the new detail page too
    setDetailHead(item.head);
    const route = buildEntryRoute(l1.code, l2.code, item.dictionaryId, item.entryId);
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
          {sidebarItems && sidebarItems.items.length > 0 ? (
            <WordListSidebar
              items={sidebarItems.items}
              currentEntryId={sidebarItems.currentId ?? ''}
              open={sidebarOpen}
              onItemClick={handleSidebarWordClick}
            />
          ) : sidebarOpen ? (
            <div className="rounded-xl border border-border bg-card h-full flex items-center justify-center">
              <div className="text-center p-4">
                <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {savedLoaded
                    ? t('msg.no_saved_words')
                    : t('msg.loading')}
                </p>
              </div>
            </div>
          ) : null}
        </aside>
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

