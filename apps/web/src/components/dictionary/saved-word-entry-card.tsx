'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { BookmarkCheck, Loader2 } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { removeCardFromStorage } from '@/hooks/use-srs';
import { normalizeInstances } from '@/hooks/use-saved-words';
import { decomposeWordId } from '@langplayer/shared';
import type { DictionaryEntry, SavedLexicalItemRecord, SavedWordContext } from '@langplayer/shared';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';

// ── Module-level entry cache (lives for the lifetime of the page session) ──
const entryFetchCache = new Map<string, DictionaryEntry | null>();

/**
 * Fetch the full dictionary entry for a saved word and cache it module-wide.
 * Uses the same decomposed dict + scoped id fetch as the entry detail page.
 * Falls back to a word lookup when the saved ID is unrecognized (legacy data).
 *
 * The returned entry is normalized so its `id` matches the saved word's id —
 * this keeps the card's bookmark state (and removal) tied to the saved record.
 */
export async function fetchSavedWordEntry(
  wordId: string,
  head: string,
  l1Code: string,
  l2Code: string,
): Promise<DictionaryEntry | null> {
  if (entryFetchCache.has(wordId)) return entryFetchCache.get(wordId) ?? null;

  const decomposed = decomposeWordId(wordId, l2Code);
  let entry: DictionaryEntry | null = null;
  // True when we got a definitive answer (entry found, or server says missing).
  // Network failures leave this false so the card retries on a later mount.
  let resolved = false;

  if (decomposed) {
    const url = `${PYTHON_API_URL}/dictionary/entry?l2=${baseCode(l2Code)}&dict=${encodeURIComponent(decomposed.dict)}&id=${encodeURIComponent(decomposed.id)}&l1=${l1Code}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        entry = (data.entry as DictionaryEntry | undefined) ?? null;
        resolved = true;
      } else if (res.status === 404) {
        resolved = true;
      }
    } catch {
      // Fall through to the lookup fallback below
    }
  }

  // Legacy/unrecognized IDs (e.g. old composite "cedict-0" or LLM entries
  // saved without a resolvable prefix) — find the entry by its head form.
  if (!entry && head) {
    try {
      const res = await fetch(`${PYTHON_API_URL}/dictionary/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: head, l2: baseCode(l2Code), l1: l1Code }),
      });
      if (res.ok) {
        const data = await res.json();
        const results: DictionaryEntry[] = data.results ?? [];
        // Prefer an exact match; otherwise take the first result.
        entry = results.find((e) => e.match_type === 'exact') ?? results[0] ?? null;
        resolved = true;
      }
    } catch {
      // Leave entry null
    }
  }

  if (entry) {
    const normalized = entry.id === wordId ? entry : { ...entry, id: wordId };
    entryFetchCache.set(wordId, normalized);
    return normalized;
  }
  // Only cache definitive misses — transient failures should be retried.
  if (resolved) entryFetchCache.set(wordId, null);
  return null;
}

interface SavedWordEntryCardProps {
  word: SavedLexicalItemRecord;
  l1Code: string;
  l2Code: string;
  onClick: () => void;
  /** SRS dot status. Omit to hide the dot. */
  srsDot?: ReactNode;
}

/**
 * A single saved word on the saved-words page — the full DictionaryEntryCard
 * (compact variant) with lazy entry fetching: entries are only fetched when
 * the card nears the viewport, mirroring InlineDefinition.
 *
 * Legacy records that no longer resolve to a dictionary entry fall back to a
 * minimal removable row (same treatment as the dictionary popup).
 */
export function SavedWordEntryCard({
  word,
  l1Code,
  l2Code,
  onClick,
  srsDot,
}: SavedWordEntryCardProps) {
  const t = useT();
  const { removeSavedWord } = useSavedWordsContext();

  const insts = normalizeInstances(word);
  const latest = insts[insts.length - 1];
  const head = word.forms?.[0] ?? latest?.context.form ?? word.context?.form ?? '?';

  const [entry, setEntry] = useState<DictionaryEntry | null | undefined>(
    () => entryFetchCache.get(word.id),
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestedRef = useRef(entry !== undefined);

  useEffect(() => {
    // Already fetched by this page session (e.g. after filtering).
    if (entryFetchCache.has(word.id)) {
      setEntry(entryFetchCache.get(word.id) ?? null);
      return;
    }

    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !requestedRef.current) {
          requestedRef.current = true;
          void fetchSavedWordEntry(word.id, head, l1Code, l2Code).then((result) => {
            setEntry(result);
          });
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [word.id, head, l1Code, l2Code]);

  const handleRemove = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    removeSavedWord(l2Code, word.id);
    removeCardFromStorage(l2Code, word.id);
  };

  // Still loading — fetch not yet triggered or in flight.
  if (entry === undefined) {
    return (
      <div ref={sentinelRef} className="rounded-lg border bg-card p-3 text-sm shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-muted-foreground/60">{head}</span>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Unresolvable legacy record — show head + remove, mirroring the popup's
  // "unrecognized saved word" treatment.
  if (!entry) {
    return (
      <div
        className="cursor-pointer rounded-lg border bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted/30"
        onClick={onClick}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-lg font-bold text-foreground">{head}</span>
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              {t('msg.unrecognized_saved_word')}
            </p>
          </div>
          <button
            onClick={handleRemove}
            className="shrink-0 text-amber-500 transition-colors hover:text-red-500"
            title={t('action.remove_from_saved')}
          >
            <BookmarkCheck className="h-5 w-5 fill-current" />
          </button>
        </div>
      </div>
    );
  }

  // Full entry — render the shared compact card.
  const ctx = latest?.context ?? word.context;
  const safeCtx: SavedWordContext = (ctx && (ctx.form || ctx.text))
    ? ctx
    : { form: head, text: head, textTitle: '' };

  return (
    <DictionaryEntryCard
      entry={entry}
      variant="compact"
      onClick={onClick}
      saveContext={safeCtx}
      l2Code={l2Code}
      l1Code={l1Code}
      srsDot={srsDot}
    />
  );
}
