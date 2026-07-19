'use client';

import { useRef, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { languageName } from '@/lib/language-data';
import { useDictionaryContext } from '@/providers/dictionary-provider';
import { Search, Loader2, X, PanelRightClose, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Persistent search bar — always rendered in the dictionary layout.
 * Reads/writes state from DictionaryContext so it survives page transitions.
 */
export function PersistentSearchBar() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const params = useParams<{ dictionaryId?: string; entryId?: string }>();
  const pathname = usePathname();
  const isDetailPage = pathname.includes('/entry/');

  const {
    query, setQuery,
    loading, detailHead,
    cameFromSearch,
    sidebarOpen, setSidebarOpen,
    doSearch, handleSearch, clearSearch,
  } = useDictionaryContext();

  const inputRef = useRef<HTMLInputElement>(null);

  // When navigating to detail page, show the head word in the search bar.
  // When navigating away from detail, restore the query if returning to results.
  useEffect(() => {
    if (isDetailPage && detailHead) {
      setQuery(detailHead);
    }
  }, [isDetailPage, detailHead, setQuery]);

  // What to show in the input
  const inputValue = isDetailPage && detailHead ? detailHead : query;
  const placeholder = t('placeholder.dictionary_search', { language: languageName(l2.code, l1.code) });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    // If on detail page and user edits the search bar, they're starting a new search
    if (isDetailPage && val !== detailHead) {
      // User is typing something different — let them
    }
  };

  const handleClear = () => {
    if (isDetailPage) {
      // On detail page, clearing returns to empty state
      clearSearch();
    } else {
      clearSearch();
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch(inputValue.trim());
    }
  };

  // Back button: only on detail page + came from search
  const showBack = isDetailPage && cameFromSearch;

  return (
    <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-background">
      {/* Back button */}
      {showBack && (
        <button
          onClick={() => { clearSearch(); }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3 L5 8 L10 13" />
          </svg>
          <span className="hidden sm:inline">All Results</span>
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

      {/* Sidebar toggle — always visible, even when collapsed */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="flex-shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
      </button>
    </div>
  );
}
