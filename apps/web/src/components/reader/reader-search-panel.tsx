'use client';

import { useCallback, useState } from 'react';
import { useT } from '@/hooks/use-t';
import { Clock, Loader2, Search } from 'lucide-react';
import type { ReaderBlock } from '@/lib/parse-markdown';

const RECENT_KEY = 'lp-reader-recent-searches';
const MAX_RECENT = 8;
const MAX_RESULTS = 30;

/** A single in-text search hit, located in the reader's block stream. */
export interface ReaderSearchResult {
  /** Index of the containing block in the block stream. */
  blockIndex: number;
  /** Display snippet around the match (may be truncated with …). */
  snippet: string;
  /** Char offset of the match inside `snippet` (after any leading …). */
  snippetMatchStart: number;
  /** Length of the matched text inside `snippet`. */
  snippetMatchLen: number;
  /** Char range of the match inside the target block's text. */
  match: { start: number; end: number };
}

function buildSnippet(
  text: string,
  matchIdx: number,
  matchLen: number,
): { snippet: string; matchStart: number } {
  const start = Math.max(0, matchIdx - 12);
  const end = Math.min(text.length, matchIdx + matchLen + 64);
  let snippet = text.slice(start, end);
  let matchStart = matchIdx - start;
  if (start > 0) {
    snippet = `…${snippet}`;
    matchStart += 1;
  }
  if (end < text.length) snippet = `${snippet}…`;
  return { snippet, matchStart };
}

/** Search the reader's text blocks (case-insensitive, whitespace-normalized). */
export function searchReaderBlocks(
  blocks: ReaderBlock[] | null,
  query: string,
): ReaderSearchResult[] {
  const q = query.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!q || !blocks) return [];
  const results: ReaderSearchResult[] = [];
  for (let i = 0; i < blocks.length && results.length < MAX_RESULTS; i++) {
    const b = blocks[i]!;
    if (b.kind !== 'text') continue;
    const text = b.text;
    const lower = text.toLowerCase();
    let from = 0;
    while (results.length < MAX_RESULTS) {
      const idx = lower.indexOf(q, from);
      if (idx === -1) break;
      const { snippet, matchStart } = buildSnippet(text, idx, q.length);
      results.push({
        blockIndex: i,
        snippet,
        snippetMatchStart: matchStart,
        snippetMatchLen: q.length,
        match: { start: idx, end: idx + q.length },
      });
      from = idx + q.length;
    }
  }
  return results;
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

interface ReaderSearchPanelProps {
  /** The reader's block stream (searched on submit). */
  blocks: ReaderBlock[] | null;
  /** Navigate to a result's block. */
  onNavigate: (result: ReaderSearchResult) => void;
}

/** Highlight the exact matched range inside a snippet. */
function HighlightSnippet({
  snippet,
  matchStart,
  matchLen,
}: {
  snippet: string;
  matchStart: number;
  matchLen: number;
}) {
  if (matchLen <= 0 || matchStart < 0 || matchStart + matchLen > snippet.length) {
    return <>{snippet}</>;
  }
  return (
    <>
      {snippet.slice(0, matchStart)}
      <mark className="rounded-sm bg-primary/40 px-0.5 text-primary dark:bg-primary/60">
        {snippet.slice(matchStart, matchStart + matchLen)}
      </mark>
      {snippet.slice(matchStart + matchLen)}
    </>
  );
}

export function ReaderSearchPanel({ blocks, onNavigate }: ReaderSearchPanelProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [results, setResults] = useState<ReaderSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setQuery(q);
    setSearching(true);
    setResults(null);
    // Search over the in-memory block stream — no network round-trip, so the
    // result renders synchronously after a single microtask.
    await Promise.resolve();
    setResults(searchReaderBlocks(blocks, q));
    setRecent(prev => {
      const next = [q, ...prev.filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setSearching(false);
  }, [blocks]);

  const clearRecent = useCallback(() => {
    setRecent([]);
    try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-2">
      {/* Search bar — pinned at the top of the fixed-height modal; it never
          scrolls or re-positions (SPEC-085 §9). */}
      <form
        className="flex shrink-0 gap-2"
        onSubmit={(e) => { e.preventDefault(); void runSearch(query); }}
      >
        <input
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

      {/* Results area — always present and always the same size, whatever the
          state (initial hint / recent / loading / empty / results). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
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
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <p className="text-sm">{t('msg.no_results')}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map((r, i) => (
                <li key={`${r.blockIndex}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onNavigate(r)}
                    className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <p className="line-clamp-2 text-sm text-foreground">
                      <HighlightSnippet
                        snippet={r.snippet}
                        matchStart={r.snippetMatchStart}
                        matchLen={r.snippetMatchLen}
                      />
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        {/* Initial state — no query and no recents: a reserved empty area so
            the modal keeps its fixed height (SPEC-085 §9.4). */}
        {results === null && !searching && recent.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Search className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t('placeholder.search')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
