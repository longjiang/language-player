'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { DictionaryEntry, ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { ArrowLeft, Loader2, AlertCircle, BookOpen, PanelRightClose, PanelRight } from 'lucide-react';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { WordListSidebar } from '@/components/dictionary/word-list-sidebar';
import { getWordListNav, updateCurrentEntryId } from '@/lib/word-list-navigation';
import type { WordListNavItem } from '@/lib/word-list-navigation';

/**
 * Single dictionary or LLM entry page.
 *
 * Route: /[l1]/[l2]/dictionary/entry/[dictionaryId]/[entryId]
 *
 * Reconstructs the composite ID (e.g. "cedict-1234" from "cedict" + "1234")
 * and fetches that specific entry from the backend. Each lexical item in
 * each dictionary gets its own addressable page — homographs like
 * 后 (empress) vs 后→後 (behind) have separate routes.
 */
export default function DictionaryEntryPage() {
  const params = useParams<{
    l1: string;
    l2: string;
    dictionaryId: string;
    entryId: string;
  }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { l1, l2 } = useLanguage();
  const t = useT();

  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Word list sidebar ──
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [navItems, setNavItems] = useState<WordListNavItem[] | null>(null);
  const [navCurrentId, setNavCurrentId] = useState<string | null>(null);
  const loadedNavRef = useRef(false);

  // Read the word list context from sessionStorage on mount.
  // The ?listCurrent= URL param overrides which item is highlighted (survives refresh).
  useEffect(() => {
    if (loadedNavRef.current) return;
    loadedNavRef.current = true;

    const listCurrentParam = searchParams.get('listCurrent');

    // Try sessionStorage first
    const stored = getWordListNav();
    if (stored) {
      setNavItems(stored.items);
      // URL param takes priority for the current entry (survives refresh / direct link)
      const currentId = listCurrentParam ?? stored.currentEntryId;
      setNavCurrentId(currentId);
      if (listCurrentParam && listCurrentParam !== stored.currentEntryId) {
        updateCurrentEntryId(listCurrentParam);
      }
    }
  }, [searchParams]);

  const fetchEntry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use params directly for l1/l2 — these are always available from the URL.
      // The useLanguage() hook may not be initialized during SSR.
      const queryL2 = baseCode(params.l2);
      const queryL1 = baseCode(params.l1);
      // CEDICT IDs contain commas (Classic format), encoded as ~ in the URL path
      const entryId = decodeURIComponent(params.entryId).replace(/~/g, ',');
      const url = `${PYTHON_API_URL}/dictionary/entry?l2=${queryL2}&dict=${encodeURIComponent(params.dictionaryId)}&id=${encodeURIComponent(entryId)}&l1=${queryL1}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          setError(t('error.entry_not_found'));
        } else {
          setError(`HTTP ${res.status}`);
        }
        setLoading(false);
        return;
      }
      const data = await res.json();
      setEntry(data.entry ?? null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load entry');
    }
    setLoading(false);
  }, [params.dictionaryId, params.entryId, l1.code, l2.code]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  const levelLabel = (level: ProficiencyLevel) => formatLevel(level).long;

  const saveContext = {
    form: entry?.head ?? '',
    text: entry?.head ?? '',
    textTitle: t('title.dictionary'),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header row: back button + sidebar toggle */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('action.back')}
        </button>
        {navItems && navItems.length > 0 && (
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Content row: entry card + sidebar */}
      <div className="flex gap-4">
        {/* Entry card */}
        <div className="min-w-0 flex-1">
          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* No entry */}
          {!loading && !error && !entry && (
            <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                {t('error.entry_not_found')}
              </p>
            </div>
          )}

          {/* Entry */}
          {!loading && !error && entry && (
            <DictionaryEntryCard
              variant="full"
              entry={entry}
              l2Code={l2.code}
              l1Code={l1.code}
              levelLabel={levelLabel}
              saveContext={saveContext}
            />
          )}
        </div>

        {/* Word list sidebar */}
        {navItems && navItems.length > 0 && navCurrentId && (
          <WordListSidebar
            items={navItems}
            currentEntryId={navCurrentId}
            open={sidebarOpen}
            onToggle={() => setSidebarOpen(o => !o)}
          />
        )}
      </div>
    </div>
  );
}
