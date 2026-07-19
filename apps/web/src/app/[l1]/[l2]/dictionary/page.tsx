'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useDictionaryContext } from '@/providers/dictionary-provider';
import { languageName } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { buildEntryRoute } from '@/lib/entry-route';
import type { DictionaryEntry, ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { Search, Loader2, BookOpen, AlertCircle, Clock } from 'lucide-react';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { WordList } from '@/components/dictionary/word-list';

export default function DictionaryPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const router = useRouter();

  const {
    results, loading, error, message, searchedText,
    recentSearches, clearRecent, handleRecentClick,
    setCameFromSearch, setSidebarSource, setDetailHead,
  } = useDictionaryContext();

  const redirectingRef = useRef(false);

  const levelLabel = (scale: string, value: string | number) =>
    formatLevel({ scale, value } as ProficiencyLevel).long;

  const saveContext = {
    form: searchedText,
    text: searchedText,
    textTitle: t('title.dictionary'),
  };

  const hasResults = results && results.length > 0;

  const handleResultClick = useCallback(
    (entry: DictionaryEntry) => {
      const dictId = entry.dictionary?.id ?? 'llm';
      setSidebarSource({ kind: 'results', items: results! });
      setCameFromSearch(true);
      setDetailHead(entry.head);
      router.push(buildEntryRoute(l1.code, l2.code, dictId, entry.id));
    },
    [results, router, l1.code, l2.code, setSidebarSource, setCameFromSearch, setDetailHead],
  );

  // Single result → redirect directly to entry detail (no results page shown)
  useEffect(() => {
    if (hasResults && results!.length === 1 && !redirectingRef.current) {
      redirectingRef.current = true;
      const entry = results![0]!;
      const dictId = entry.dictionary?.id ?? 'llm';
      setSidebarSource({ kind: 'results', items: results! });
      setCameFromSearch(true);
      setDetailHead(entry.head);
      router.replace(buildEntryRoute(l1.code, l2.code, dictId, entry.id));
    }
  }, [hasResults, results, router, l1.code, l2.code, setSidebarSource, setCameFromSearch, setDetailHead]);

  // Reset redirect flag when results change
  useEffect(() => {
    if (!hasResults || results!.length !== 1) {
      redirectingRef.current = false;
    }
  }, [hasResults, results]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  // ── No results message ──
  if (message && !hasResults) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  }

  // ── Results (multiple results only; single result redirects to detail) ──
  if (hasResults) {
    return (
      <div className="p-6">
        <p className="mb-4 text-sm text-muted-foreground">
          {t('msg.result_count', { count: results!.length })} {t('msg.for_term', { term: searchedText })}
        </p>
        <WordList>
          {results!.map((entry) => (
            <DictionaryEntryCard
              key={entry.id}
              variant="compact"
              entry={entry}
              l2Code={l2.code}
              l1Code={l1.code}
              levelLabel={levelLabel}
              saveContext={saveContext}
              onClick={() => handleResultClick(entry)}
            />
          ))}
        </WordList>
      </div>
    );
  }

  // ── Empty state (recent searches) ──
  return (
    <div className="p-6">
      {recentSearches.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              {t('title.recent_searches')}
            </h2>
            <button
              onClick={clearRecent}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('action.clear_recent_searches')}
            </button>
          </div>
          <div className="space-y-1">
            {recentSearches.map((term) => (
              <button
                key={term}
                onClick={() => handleRecentClick(term)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
              >
                <Clock className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
                <span className="truncate">{term}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Search className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            {t('msg.dictionary_empty_state', { l2: languageName(l2.code) })}
          </p>
        </div>
      )}
    </div>
  );
}

