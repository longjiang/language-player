'use client';

import { useCallback, useRef, useState } from 'react';
import { useT } from '@/hooks/use-t';
import { Clock, Loader2, Search } from 'lucide-react';
import type { EpubSearchResult } from '@/hooks/use-epub';

const RECENT_KEY = 'lp-epub-recent-searches';
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

interface EpubSearchPanelProps {
  /** Runs the search against the open book. */
  onSearch: (query: string) => Promise<EpubSearchResult[]>;
  /** Navigate to a result's chapter + page. */
  onNavigate: (result: EpubSearchResult) => void;
}

/** Highlight the searched term inside a snippet. */
function HighlightSnippet({ snippet, term }: { snippet: string; term: string }) {
  const idx = term ? snippet.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (idx === -1) return <>{snippet}</>;
  return (
    <>
      {snippet.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 px-0.5 text-foreground">
        {snippet.slice(idx, idx + term.length)}
      </mark>
      {snippet.slice(idx + term.length)}
    </>
  );
}

export function EpubSearchPanel({ onSearch, onNavigate }: EpubSearchPanelProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [results, setResults] = useState<EpubSearchResult[] | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setQuery(q);
    setSearching(true);
    setResults(null);
    try {
      const res = await onSearch(q);
      setResults(res);
      setSearchedQuery(q);
      setRecent(prev => {
        const next = [q, ...prev.filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    } finally {
      setSearching(false);
    }
  }, [onSearch]);

  const clearRecent = useCallback(() => {
    setRecent([]);
    try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <div className="flex flex-col gap-3 p-2">
      {/* Search bar */}
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void runSearch(query); }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('placeholder.search')}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          aria-label={t('action.search')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
      </form>

      {/* Recent searches */}
      {results === null && !searching && recent.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('title.recent_searches')}
            </p>
            <button
              type="button"
              onClick={clearRecent}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('action.clear_recent_searches')}
            </button>
          </div>
          <ul className="flex flex-col gap-0.5">
            {recent.map(r => (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => void runSearch(r)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{r}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Searching */}
      {searching && (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('msg.loading')}
        </div>
      )}

      {/* Results */}
      {results !== null && !searching && (
        results.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_results')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map((r, i) => (
              <li key={`${r.chapterHref}-${i}`}>
                <button
                  type="button"
                  onClick={() => onNavigate(r)}
                  className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <p className="line-clamp-2 text-sm text-foreground">
                    <HighlightSnippet snippet={r.snippet} term={searchedQuery} />
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.chapterTitle || `#${r.chapterIndex}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
