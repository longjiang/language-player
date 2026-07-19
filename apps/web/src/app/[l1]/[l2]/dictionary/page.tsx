'use client';

import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { languageName, baseCode } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { useDictionary } from '@langplayer/api-client';
import type { DictionaryEntry, ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { Search, Loader2, BookOpen, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { WordList } from '@/components/dictionary/word-list';
import { setWordListNav, entryToNavItem, buildEntryRouteWithList } from '@/lib/word-list-navigation';
import { buildEntryRoute } from '@/lib/entry-route';

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
      setLoading(true);
      setError(null);
      setResults(null);
      setMessage(null);
      setSearchedText(trimmed);

      // Update URL to reflect the current search
      const params = new URLSearchParams(searchParams.toString());
      params.set('q', trimmed);
      router.replace(`/${l1.code}/${l2.code}/dictionary?${params.toString()}`, { scroll: false });

      try {
        const response: any = await dict.lookup(trimmed, baseCode(l2.code), l1.code);
        const results: DictionaryEntry[] = response.results ?? [];

        // If only one result, navigate directly to the entry detail page
        if (results.length === 1) {
          const entry = results[0]!;
          router.replace(buildEntryRoute(l1.code, l2.code, entry.dictionary?.id ?? 'llm', entry.id));
          return;
        }

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
    async (e?: FormEvent) => {
      e?.preventDefault();
      await doSearch(query.trim());
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

  const levelLabel = (level: ProficiencyLevel) => formatLevel(level).long;

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

      {/* ── Results ── */}
      {hasResults && (
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

      {/* ── Initial empty state ── */}
      {!results && !message && !loading && !error && (
        <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Search className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            {t('msg.dictionary_empty_state', { l2: languageName(l2.code) })}
          </p>
        </div>
      )}
    </div>
  );
}

