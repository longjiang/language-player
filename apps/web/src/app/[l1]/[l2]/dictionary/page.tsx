'use client';

import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { languageName, baseCode } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { useDictionary } from '@langplayer/api-client';
import type { DictionaryEntry } from '@langplayer/shared';
import { Search, Loader2, BookOpen, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
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
  const loadingRef = useRef(false); // ref-based guard avoids stale-closure race with Strict Mode double-invoke

  // Auto-search from ?q= param on first load
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !searched) {
      setQuery(q);
      setSearched(true);
      // Trigger search after state settles
      setTimeout(() => {
        doSearch(q);
      }, 100);
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

      try {
        const response: any = await dict.lookup(trimmed, baseCode(l2.code), l1.code);
        setResults(response.results);
        setMessage(response.message ?? null);
      } catch (err: any) {
        setError(err?.message ?? t('error.something_went_wrong'));
        setResults(null);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [dict, l2.code, l1.code, t],
  );

  const handleSearch = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      await doSearch(query.trim());
    },
    [query, doSearch],
  );

  // Determine proficiency scale for level display
  const levelScaleLabel = (scale: string): string => {
    const map: Record<string, string> = { hsk: 'HSK', hsk_2010: 'HSK 2010', hsk_2026: 'HSK 2026', jlpt: 'JLPT', cefr: 'CEFR' };
    return map[scale] ?? scale.toUpperCase();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title.dictionary')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.lookup_words_desc', { l1: languageName(l1.code), l2: languageName(l2.code, l1.code) })}
      </p>

      {/* ── Search Form ── */}
      <form onSubmit={handleSearch} className="mt-8 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              l2.code === 'zh'
                ? '输入中文词语...'
                : l2.code === 'ja'
                  ? '単語を入力...'
                  : `Enter a word in ${languageName(l2.code, l1.code)}...`
            }
            className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {t('action.search')}
        </Button>
      </form>

      {/* ── Error ── */}
      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Message (no results) ── */}
      {message && !results?.length && !loading && (
        <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{message}</p>
        </div>
      )}

      {/* ── Results ── */}
      {results && results.length > 0 && (
        <div className="mt-8">
          <p className="mb-4 text-sm text-muted-foreground">
            {results.length} {results.length === 1 ? 'result' : 'results'} for <strong>"{searchedText}"</strong>
          </p>
          <div className="space-y-4">
            {results.map((entry) => (
              <DictionaryEntryCard
                key={entry.id}
                variant="compact"
                entry={entry}
                l2Code={l2.code}
                l1Code={l1.code}
                levelLabel={levelScaleLabel}
                saveContext={{ form: searchedText, text: searchedText, textTitle: 'Dictionary' }}
                onClick={(e) => router.push(buildEntryRoute(l1.code, l2.code, e.dictionary?.id ?? 'llm', e.id))}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Initial empty state ── */}
      {!results && !message && !loading && !error && (
        <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Search className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            {l2.code === 'zh'
              ? '搜索中文词语，查看释义和拼音'
              : l2.code === 'ja'
                ? '単語を検索して、読み方や意味を調べましょう'
                : `Search for a word in ${languageName(l2.code)} to see definitions, pronunciation, and more.`}
          </p>
        </div>
      )}
    </div>
  );
}

