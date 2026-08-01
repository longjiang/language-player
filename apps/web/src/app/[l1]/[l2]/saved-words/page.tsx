'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useSrs } from '@/hooks/use-srs';
import { useT } from '@/hooks/use-t';
import { languageName } from '@/lib/language-data';
import {
  BookOpen, Trash2, Download,
  Loader2, Search, ArrowUpDown, Clock, ArrowDownAZ, Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SavedWordEntryCard } from '@/components/dictionary/saved-word-entry-card';
import { setWordListNav, savedWordToNavItem, buildEntryRouteWithList } from '@/lib/word-list-navigation';
import { decomposeWordId } from '@langplayer/shared';
import type { SavedLexicalItemRecord, SrsFields } from '@langplayer/shared';
import { normalizeInstances } from '@/hooks/use-saved-words';

const STORAGE_KEY = 'zthSavedWords';

type SortMode = 'newest' | 'alpha';

// ── Helpers ──────────────────────────────────────

/** SRS review status for a word. null = not added to SRS. */
type SrsStatus = 'due' | 'overdue' | 'new' | 'ok' | null;

function getSrsStatus(
  card: SrsFields | undefined,
): SrsStatus {
  if (!card) return null;
  const now = Date.now();
  // New card: never reviewed, interval is 0
  if (card.nextReview === 0 && card.repetitions === 0) return 'new';
  // Overdue: due more than a day ago
  if (card.nextReview < now - 24 * 60 * 60 * 1000) return 'overdue';
  // Due: nextReview is in the past (or now)
  if (card.nextReview <= now) return 'due';
  return 'ok';
}

const SRS_DOT_CLASSES: Record<Exclude<SrsStatus, null>, string> = {
  overdue: 'text-red-500 fill-red-500',
  due: 'text-amber-500 fill-amber-500',
  new: 'text-blue-400 fill-blue-400',
  ok: 'text-emerald-400 fill-emerald-400',
};

// ── Page ─────────────────────────────────────────

/**
 * Saved Words page — vocabulary list for the current L2.
 * Route: /[l1]/[l2]/saved-words
 */
export default function SavedWordsPage() {
  const { l1, l2 } = useLanguage();
  const { getSavedWords, clearSavedWords, loaded } = useSavedWordsContext();
  const { getCard } = useSrs();
  const router = useRouter();
  const t = useT();

  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [filterText, setFilterText] = useState('');

  const allWords = useMemo(() => getSavedWords(l2.code), [getSavedWords, l2.code]);

  // Apply filter + sort
  const words = useMemo(() => {
    let result = [...allWords];

    // Text filter: match against any form or instance context
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      result = result.filter((w) => {
        // Check global forms
        if (w.forms.some((f) => f.toLowerCase().includes(q))) return true;
        // Check all instances
        const insts = normalizeInstances(w);
        return insts.some((i) =>
          i.form.toLowerCase().includes(q) ||
          i.context.text.toLowerCase().includes(q) ||
          i.context.videoTitle?.toLowerCase().includes(q),
        );
      });
    }

    // Sort
    if (sortMode === 'alpha') {
      result.sort((a, b) => (a.forms[0] ?? '').localeCompare(b.forms[0] ?? ''));
    } else {
      // newest first (default)
      result.sort((a, b) => b.date - a.date);
    }

    return result;
  }, [allWords, filterText, sortMode]);

  // Group by date: today vs earlier
  const { today, earlier } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayWords: SavedLexicalItemRecord[] = [];
    const earlierWords: SavedLexicalItemRecord[] = [];

    for (const w of words) {
      if (w.date >= startOfToday) {
        todayWords.push(w);
      } else {
        earlierWords.push(w);
      }
    }
    return { today: todayWords, earlier: earlierWords };
  }, [words]);

  const handleExport = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saved-words-${l2.code}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const handleClearAll = () => {
    if (window.confirm(t('msg.confirm_clear_words'))) {
      clearSavedWords(l2.code);
    }
  };

  /** Navigate to the entry detail page for a saved word. */
  const handleWordClick = (word: SavedLexicalItemRecord) => {
    // Store the full saved-words list so the entry page can show a sidebar
    setWordListNav(words.map(w => savedWordToNavItem(w, l2.code)), word.id);

    const decomposed = decomposeWordId(word.id, l2.code);
    if (decomposed) {
      router.push(buildEntryRouteWithList(l1.code, l2.code, decomposed.dict, decomposed.id, word.id));
    } else {
      // Unrecognized ID format — fall back to search by first form
      router.push(`/${l1.code}/${l2.code}/dictionary?q=${encodeURIComponent(word.forms[0] ?? '')}`);
    }
  };

  if (!loaded) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t('title.saved_words')}</h1>
        <p className="mt-1 text-muted-foreground">
          {t('msg.saved_words_desc', {
            count: allWords.length,
            l2: languageName(l2.code, l1.code),
          })}
        </p>
      </div>

      {allWords.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg text-muted-foreground">
            {t('msg.no_saved_words')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Click the bookmark icon next to any word to save it.
          </p>
        </div>
      ) : (
        <>
          {/* Toolbar: filter + sort + actions */}
          <div className="mb-6 flex items-center gap-3">
            {/* Search/filter input */}
            <div className="relative min-w-0 flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder={t('placeholder.filter')}
                className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Sort toggle */}
            <Button
              variant="ghost"
              className="gap-2 text-sm text-muted-foreground"
              onClick={() => setSortMode((m) => (m === 'newest' ? 'alpha' : 'newest'))}
            >
              <ArrowUpDown className="h-4 w-4" />
              {sortMode === 'newest' ? (
                <>
                  <Clock className="h-4 w-4" />
                  {t('sort.newest')}
                </>
              ) : (
                <>
                  <ArrowDownAZ className="h-4 w-4" />
                  {t('sort.alphabetical')}
                </>
              )}
            </Button>

            {/* Result count when filtering */}
            {filterText.trim() && (
              <span className="text-xs text-muted-foreground">
                {words.length} / {allWords.length}
              </span>
            )}

            {/* Export / Clear All — icon-only on narrow screens */}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={allWords.length === 0}
                className="gap-1.5 px-2 sm:px-4"
                title={t('action.export')}
                aria-label={t('action.export')}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{t('action.export')}</span>
              </Button>
              <Button
                variant="outline"
                onClick={handleClearAll}
                disabled={allWords.length === 0}
                className="gap-1.5 px-2 sm:px-4"
                title={t('action.clear_all')}
                aria-label={t('action.clear_all')}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t('action.clear_all')}</span>
              </Button>
            </div>
          </div>

          {/* Word groups */}
          <div className="space-y-8">
            {today.length > 0 && (
              <SavedWordGroup
                label={t('msg.today')}
                words={today}
                l1Code={l1.code}
                l2Code={l2.code}
                getCard={getCard}
                onWordClick={handleWordClick}
              />
            )}

            {earlier.length > 0 && (
              <SavedWordGroup
                label={t('msg.earlier')}
                words={earlier}
                l1Code={l1.code}
                l2Code={l2.code}
                getCard={getCard}
                onWordClick={handleWordClick}
              />
            )}

            {words.length === 0 && filterText.trim() && (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">{t('msg.no_results')}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────

/** Renders a group of saved words under a date heading. */
function SavedWordGroup({
  label,
  words,
  l1Code,
  l2Code,
  getCard,
  onWordClick,
}: {
  label: string;
  words: SavedLexicalItemRecord[];
  l1Code: string;
  l2Code: string;
  getCard: (l2Code: string, wordId: string) => SrsFields | undefined;
  onWordClick: (word: SavedLexicalItemRecord) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-muted-foreground">{label}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {words.length}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {words.map((word) => {
          const card = getCard(l2Code, word.id);
          const srsStatus = getSrsStatus(card);
          return (
            <SavedWordEntryCard
              key={`${word.id}-${word.date}`}
              word={word}
              l1Code={l1Code}
              l2Code={l2Code}
              onClick={() => onWordClick(word)}
              srsDot={
                srsStatus ? (
                  <span
                    title={
                      srsStatus === 'overdue' ? 'Overdue for review' :
                      srsStatus === 'due' ? 'Due for review' :
                      srsStatus === 'new' ? 'New — not yet reviewed' :
                      'Reviewed'
                    }
                  >
                    <Circle className={`h-2.5 w-2.5 flex-shrink-0 ${SRS_DOT_CLASSES[srsStatus]}`} />
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────
