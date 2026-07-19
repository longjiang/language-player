'use client';

import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { languageName, baseCode } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { useDictionary } from '@langplayer/api-client';
import type { DictionaryEntry, ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { Search, Loader2, BookOpen, AlertCircle, X, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { WordList } from '@/components/dictionary/word-list';
import { setWordListNav, entryToNavItem, buildEntryRouteWithList } from '@/lib/word-list-navigation';
import { buildEntryRoute } from '@/lib/entry-route';

const RECENT_STORAGE_PREFIX = 'zthRecentSearches:';
const MAX_RECENT = 10;

function loadRecent(l2Code: string): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_PREFIX + l2Code);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function saveRecent(l2Code: string, term: string) {
  const prev = loadRecent(l2Code).filter((t) => t !== term);
  prev.unshift(term);
  localStorage.setItem(RECENT_STORAGE_PREFIX + l2Code, JSON.stringify(prev.slice(0, MAX_RECENT)));
}

function clearRecent(l2Code: string) {
  localStorage.removeItem(RECENT_STORAGE_PREFIX + l2Code);
}

export default function DictionaryPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const dict = useDictionary();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searched, setSearched] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DictionaryEntry[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedText, setSearchedText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecent(l2.code));

  // Reload recent searches when l2 changes
  useEffect(() => {
    setRecentSearches(loadRecent(l2.code));
  }, [l2.code]);

  // Auto-search from ?q= param on first load
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !searched) {
      setQuery(q);
      setSearched(true);
      setTimeout(() => { doSearch(q); }, 100);
    }
  }, [searchParams, searched]);

  const doSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (!trimmed || loadingRef.current) return;
      loadingRef.current = true;

      // Force-immediately commit loading state to DOM before any async work
      flushSync(() => {
        setLoading(true);
        setError(null);
        setResults(null);
        setMessage(null);
        setSearchedText(trimmed);
      });

      // Save recent search optimistically — instant feedback
      saveRecent(l2.code, trimmed);
      setRecentSearches(loadRecent(l2.code));

      // Update URL (deferred — doesn't block rendering)
      const params = new URLSearchParams(searchParams.toString());
      params.set('q', trimmed);
      router.replace(`/${l1.code}/${l2.code}/dictionary?${params.toString()}`, { scroll: false });

      try {
        const response: any = await dict.lookup(trimmed, baseCode(l2.code), l1.code);
        const results: DictionaryEntry[] = response.results ?? [];

        // Always show results inline — single result renders as full card, never auto-redirect
        setResults(results);
        setMessage(response.message ?? null);
      } catch (err: any) {
        setError(err?.message ?? t('error.something_went_wrong'));
        setResults(null);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [dict, l2.code, l1.code, t, searchParams, router, l1.code],
  );

  const handleSearch = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      doSearch(query.trim());
    },
    [query, doSearch],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults(null);
    setMessage(null);
    setError(null);
    setSearchedText('');
    setSearched(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    router.replace(`/${l1.code}/${l2.code}/dictionary?${params.toString()}`, { scroll: false });
    inputRef.current?.focus();
  }, [router, l1.code, l2.code, searchParams]);

  const handleRecentClick = useCallback((term: string) => {
    setQuery(term);
    setSearched(true);
    doSearch(term);
  }, [doSearch]);

  const handleClearRecent = useCallback(() => {
    clearRecent(l2.code);
    setRecentSearches([]);
  }, [l2.code]);

  const levelLabel = (scale: string, value: string | number) => formatLevel({ scale, value } as ProficiencyLevel).long;

  const saveContext = {
    form: searchedText,
    text: searchedText,
    textTitle: t('title.dictionary'),
  };

  const hasResults = results && results.length > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* ── Header ── */}
      <h1 className="text-3xl font-bold">{t('title.dictionary')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.lookup_words_desc', { l1: languageName(l1.code), l2: languageName(l2.code, l1.code) })}
      </p>

      {/* ── Search bar ── */}
      <form onSubmit={handleSearch} className="mt-8 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('placeholder.dictionary_search', { language: languageName(l2.code, l1.code) })}
            className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {t('action.search')}
        </Button>
      </form>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── No results message ── */}
      {message && !hasResults && !loading && (
        <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{message}</p>
        </div>
      )}

      {/* ── Single result (full card) ── */}
      {hasResults && results.length === 1 && (
        <div>
          <p className="mb-4 mt-6 text-sm text-muted-foreground">
            {t('msg.result_count', { count: 1 })} {t('msg.for_term', { term: searchedText })}
          </p>
          <DictionaryEntryCard
            variant="full"
            entry={results[0]!}
            l2Code={l2.code}
            l1Code={l1.code}
            levelLabel={levelLabel}
            saveContext={saveContext}
          />
        </div>
      )}

      {/* ── Multiple results (compact list) ── */}
      {hasResults && results.length > 1 && (
        <div>
          <p className="mb-4 mt-6 text-sm text-muted-foreground">
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
                onClick={(e) => {
                  const compositeId = `${e.dictionary?.id ?? 'llm'}-${e.id}`;
                  setWordListNav(results!.map(entryToNavItem), compositeId);
                  router.push(buildEntryRouteWithList(l1.code, l2.code, e.dictionary?.id ?? 'llm', e.id, compositeId));
                }}
              />
            ))}
          </WordList>
        </div>
      )}

      {/* ── Recent searches / empty state ── */}
      {!results && !message && !loading && !error && (
        <>
          {recentSearches.length > 0 ? (
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {t('title.recent_searches')}
                </h2>
                <button
                  onClick={handleClearRecent}
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
            <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
              <Search className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                {t('msg.dictionary_empty_state', { l2: languageName(l2.code) })}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

