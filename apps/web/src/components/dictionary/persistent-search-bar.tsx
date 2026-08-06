'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { languageName, baseCode } from '@/lib/language-data';
import { useDictionaryContext } from '@/providers/dictionary-provider';
import { useDictionary } from '@langplayer/api-client';
import type { DictionaryEntry } from '@langplayer/shared';
import { log, logwarn } from '@/lib/logger';
import { Search, Loader2, X, PanelRightClose, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isSidebarAvailable } from '@/components/dictionary/word-list-sidebar';
import { WordList } from '@/components/dictionary/word-list';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { buildEntryRouteWithList, entryToNavItem, setWordListNav } from '@/lib/word-list-navigation';

/**
 * Persistent search bar — always rendered in the dictionary layout.
 * Reads/writes state from DictionaryContext so it survives page transitions.
 */
export function PersistentSearchBar() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const isDetailPage = pathname.includes('/entry/');

  const {
    query, setQuery,
    loading, detailHead,
    cameFromSearch,
    sidebarSource,
    sidebarOpen, setSidebarOpen,
    setMobileSidebarOpen,
    setCameFromSearch, setDetailHead,
    doSearch, handleSearch, clearSearch,
  } = useDictionaryContext();

  const inputRef = useRef<HTMLInputElement>(null);
  const [userEdited, setUserEdited] = useState(false);

  // ── Autocomplete state (ephemeral — local to the search bar, never URL) ──
  const dict = useDictionary();
  // useDictionary() returns a fresh object every render. Holding it in a ref
  // keeps the effect dependency array stable — otherwise any state update
  // (acLoading/acOpen/suggestions) re-renders → new dict identity → the
  // debounce effect re-runs → reschedules → re-requests the same query,
  // forever (spinner/results flashing on and off).
  const dictRef = useRef(dict);
  dictRef.current = dict;
  const [suggestions, setSuggestions] = useState<DictionaryEntry[] | null>(null);
  const [acLoading, setAcLoading] = useState(false);
  const [acOpen, setAcOpen] = useState(false);
  const acSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When navigating to a new detail page, sync the search bar to the head word
  useEffect(() => {
    if (isDetailPage && detailHead) {
      setQuery(detailHead);
      setUserEdited(false);
    }
  }, [isDetailPage, detailHead, setQuery]);

  // Debounced autocomplete lookup (l1 unset → English defs, no translation).
  // Only fires while the user is actually typing (userEdited) and only touches
  // local state — URL/recents stay untouched until a real search/selection.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!userEdited || !trimmed) {
      setSuggestions(null);
      setAcOpen(false);
      setAcLoading(false);
      return;
    }
    const seq = ++acSeqRef.current;
    debounceRef.current = setTimeout(async () => {
      const startedAt = performance.now();
      const l2Code = baseCode(l2.code);
      log('Dictionary autocomplete request:', { text: trimmed, l2: l2Code });
      setAcLoading(true);
      setAcOpen(true);
      try {
        // byDefinition=true: an English query also matches Chinese entries by
        // their English definitions, so 'meal' suggests 饭/餐/meal entries.
        const res = await dictRef.current.autocomplete(trimmed, l2Code, true);
        if (seq !== acSeqRef.current) return; // stale — a newer keystroke won
        const results = res.results ?? [];
        setSuggestions(results);
        setAcOpen(results.length > 0);
        log('Dictionary autocomplete:', {
          text: trimmed,
          l2: l2Code,
          results: results.length,
          ms: Math.round(performance.now() - startedAt),
        });
      } catch (err) {
        if (seq === acSeqRef.current) {
          setSuggestions(null);
          setAcOpen(false);
          logwarn('Dictionary autocomplete failed:', {
            text: trimmed,
            l2: l2Code,
            error: err instanceof Error ? err.message : err,
          });
        }
      } finally {
        if (seq === acSeqRef.current) setAcLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, userEdited, l2.code]);

  // What to show in the input
  const inputValue = (isDetailPage && detailHead && !userEdited) ? detailHead : query;
  const placeholder = t('placeholder.dictionary_search', { language: languageName(l2.code, l1.code) });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setUserEdited(true);
  };

  const closeSuggestions = useCallback(() => {
    setAcOpen(false);
  }, []);

  const handleClear = () => {
    clearSearch();
    setUserEdited(false);
    setSuggestions(null);
    setAcOpen(false);
    inputRef.current?.focus();
  };

  // Selecting a suggestion navigates straight to the entry, reusing the same
  // list + navigation helpers as the results page (sidebar keeps prev/next).
  const handleSuggestionClick = useCallback(
    (entry: DictionaryEntry) => {
      const item = entryToNavItem(entry);
      const items = (suggestions ?? []).map(entryToNavItem);
      setWordListNav(items, item.id, 'search');
      setCameFromSearch(true);
      setDetailHead(entry.head);
      setSuggestions(null);
      setAcOpen(false);
      router.push(buildEntryRouteWithList(l1.code, l2.code, item.dictionaryId, item.entryId, item.id));
    },
    [suggestions, router, l1.code, l2.code, setCameFromSearch, setDetailHead],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setAcOpen(false);
      doSearch(inputValue.trim());
    } else if (e.key === 'Escape') {
      setAcOpen(false);
    }
  };

  // Back button: only on detail page + came from search
  const showBack = isDetailPage && cameFromSearch;

  // Sidebar toggles only make sense while the sidebar has a list to show.
  const sidebarAvailable = isSidebarAvailable(sidebarSource);

  return (
    <div className="flex items-center gap-3 py-4 bg-background">
      {/* Back button */}
      {showBack && (
        <button
          onClick={() => { router.push(`/${l1.code}/${l2.code}/dictionary?q=${encodeURIComponent(query)}`); }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3 L5 8 L10 13" />
          </svg>
          <span className="hidden sm:inline">{t('action.all_results')}</span>
        </button>
      )}

      {/* Search input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={closeSuggestions}
          placeholder={isDetailPage && detailHead ? detailHead : placeholder}
          className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-8 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {/* Clear button — always visible when there's content */}
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('action.clear_recent_searches')}
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Autocomplete dropdown — reuses WordList + DictionaryEntryCard (compact) */}
        {acOpen && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-lg"
            onMouseDown={(e) => e.preventDefault()}
          >
            {acLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <WordList>
                {(suggestions ?? []).map((entry) => (
                  <DictionaryEntryCard
                    key={entry.id}
                    entry={entry}
                    variant="compact"
                    l2Code={l2.code}
                    l1Code={l1.code}
                    onClick={() => handleSuggestionClick(entry)}
                  />
                ))}
              </WordList>
            )}
          </div>
        )}
      </div>

      {/* Submit button */}
      <Button
        type="submit"
        size="sm"
        disabled={loading || !inputValue.trim()}
        onClick={handleSearch}
        className="shrink-0"
      >
        {loading ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Search className="mr-1 h-4 w-4" />
        )}
        <span className="hidden sm:inline">{t('action.search')}</span>
      </Button>

      {/* Sidebar toggles — only when the sidebar is available (source list >1) */}
      {sidebarAvailable && (
        <>
          {/* Mobile: opens the slide-in sheet */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden flex-shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={t('action.show_sidebar')}
          >
            <PanelRight className="h-4 w-4" />
          </button>

          {/* Desktop: collapses the persistent panel */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex flex-shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={sidebarOpen ? t('action.hide_sidebar') : t('action.show_sidebar')}
          >
            {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          </button>
        </>
      )}
    </div>
  );
}
