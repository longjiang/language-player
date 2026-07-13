'use client';

import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { languageName, baseCode } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { useDictionary } from '@langplayer/api-client';
import type { DictionaryEntry } from '@langplayer/shared';
import { Search, Loader2, BookOpen, ExternalLink, AlertCircle, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SaveButton } from '@/components/save-button';
import type { SavedWordContext } from '@langplayer/shared';

export default function DictionaryPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const dict = useDictionary();
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
        {t('msg.lookup_words_desc', { l1: languageName(l1.code), l2: languageName(l2.code) })}
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
                  : `Enter a word in ${languageName(l2.code)}...`
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
            {results.map((entry, idx) => (
              <DictionaryCard key={entry.id || idx} entry={entry} levelScaleLabel={levelScaleLabel} searchedText={searchedText} />
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

/** Individual dictionary result card. */
function DictionaryCard({
  entry,
  levelScaleLabel,
  searchedText,
}: {
  entry: DictionaryEntry;
  levelScaleLabel: (scale: string) => string;
  searchedText: string;
}) {
  const router = useRouter();
  const context: SavedWordContext = {
    form: searchedText,
    text: searchedText,
    textTitle: 'Dictionary',
  };

  const handleCardClick = () => {
    router.push(`./word/${encodeURIComponent(entry.head)}`);
  };

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/30 cursor-pointer"
      onClick={handleCardClick}
    >
      {/* Head word & pronunciation */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold">{entry.head}</h3>
            {entry.alternate && entry.alternate !== entry.head && (
              <span className="text-sm text-muted-foreground">({entry.alternate})</span>
            )}
          </div>
          {entry.pronunciation && (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Volume2 className="h-3.5 w-3.5" />
              {entry.pronunciation}
            </p>
          )}
        </div>

        {/* Bookmark + match type badge */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <SaveButton
            wordId={entry.id}
            head={entry.head}
            context={context}
          />
          {entry.match_type && entry.match_type !== 'exact' && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {entry.match_type}
            </span>
          )}
        </div>
      </div>

      {/* Part of speech + level */}
      <div className="mt-2 flex flex-wrap gap-2">
        {entry.part_of_speech && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {entry.part_of_speech}
          </span>
        )}
        {entry.level && (
          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {levelScaleLabel(entry.level.scale)} {entry.level.value}
          </span>
        )}
        {entry.source && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{entry.source}</span>
        )}
      </div>

      {/* Definitions */}
      <ul className="mt-3 space-y-1.5">
        {entry.definitions.map((def, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="mt-1 flex-shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
            <span>{def}</span>
          </li>
        ))}
      </ul>

      {/* Han script detail (Chinese/Cantonese) */}
      {entry.han_script && (entry.han_script.traditional || entry.han_script.simplified) && (
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          {entry.han_script.simplified && entry.han_script.simplified !== entry.head && (
            <span>简: {entry.han_script.simplified}</span>
          )}
          {entry.han_script.traditional && entry.han_script.traditional !== entry.head && (
            <span>繁: {entry.han_script.traditional}</span>
          )}
        </div>
      )}

      {/* Phonetic detail */}
      {entry.phonetic_detail && typeof entry.phonetic_detail === 'object' && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground/70">
          {Object.entries(entry.phonetic_detail).map(([key, value]) => {
            if (typeof value === 'string' && value && key !== 'romaji' && key !== 'pinyin' && key !== 'jyutping') {
              return <span key={key}>{key}: {value}</span>;
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

