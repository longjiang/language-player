'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { LemmatizedToken, DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { Loader2, X, AlertCircle, AlertTriangle, History } from 'lucide-react';
import { DictionaryEntryCard } from './dictionary-entry-card';
import { AiExplanation } from './ai-explanation';
import { SaveButton } from './save-button';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { partitionSavedWords } from '@/lib/legacy-word-resolver';

interface DictionaryPopupProps {
  token: LemmatizedToken;
  l1Code: string;
  l2Code: string;
  position?: { x: number; y: number };
  /** Context for word saving (subtitle line, video title, etc.) */
  context?: SavedWordContext;
  onClose: () => void;
}

/** Fetches dictionary entries for a token and displays them in a popover. */
export function DictionaryPopup({
  token,
  l1Code,
  l2Code,
  context,
  onClose,
}: DictionaryPopupProps) {
  const router = useRouter();
  const { l2 } = useLanguage();
  const { getSavedWords, removeSavedWord, saveWord } = useSavedWordsContext();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lookupWord = useCallback(async (text: string, signal: AbortSignal) => {
    try {
      const res = await fetch(`${PYTHON_API_URL}/dictionary/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, l2: baseCode(l2Code), l1: l1Code }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.results ?? []) as DictionaryEntry[];
    } catch {
      return [];
    }
  }, [l1Code, l2Code]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const search = async () => {
      const texts = [
        ...token.lemmas.map((l) => l.lemma),
        token.text,
      ].filter((t, i, a) => a.indexOf(t) === i);

      let allEntries: DictionaryEntry[] = [];

      for (const text of texts) {
        if (cancelled) break;
        const results = await lookupWord(text, controller.signal);
        if (!cancelled) {
          for (const e of results) {
            if (!e.match_type) {
              e.match_type = text === token.text ? 'exact' : 'lemma';
            }
          }
          allEntries.push(...results);
        }
        if (allEntries.length > 0) break;
      }

      if (!cancelled) {
        const seen = new Set<string>();
        const deduped = allEntries.filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        setEntries(deduped);
        setLoading(false);
      }
    };

    search().catch((err) => {
      if (!cancelled && err.name !== 'AbortError') {
        setError(err?.message ?? 'Lookup failed');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, lookupWord]);

  const levelLabel = (scale: string, value: string | number): string => {
    const map: Record<string, string> = {
      hsk_2010: 'HSK',
      hsk_2026: 'HSK',
      jlpt: 'JLPT',
      cefr: 'CEFR',
    };
    const prefix = map[scale] ?? scale.toUpperCase();
    return `${prefix} ${value}`;
  };

  const handleEntryClick = (entry: DictionaryEntry) => {
    router.push(`/${l1Code}/${l2Code}/dictionary/word/${encodeURIComponent(entry.head)}`);
  };

  // Detect legacy saved words that don't match any current entry
  const legacySavedWords = useMemo(() => {
    if (loading || entries.length === 0) return [];
    const savedWords = getSavedWords(l2.code);
    const { unmatched } = partitionSavedWords(token.text, savedWords, entries);
    return unmatched;
  }, [loading, entries, token.text, l2.code, getSavedWords]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Popover */}
      <div className="fixed left-1/2 top-1/3 z-50 w-[28rem] max-w-[90vw] -translate-x-1/2 rounded-xl border bg-popover p-4 shadow-xl">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="text-xl font-bold">{token.text}</span>
            {token.pronunciation && (
              <span className="ml-2 text-sm text-muted-foreground">
                /{token.pronunciation}/
              </span>
            )}
            {token.lemmas.length > 0 && token.lemmas[0]!.lemma !== token.text && (
              <div className="text-xs text-muted-foreground">
                lemma: {token.lemmas.map((l) => l.lemma).join(', ')}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[50vh] overflow-y-auto space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>No dictionary entry found for "{token.text}"</p>
              {token.lemmas.length > 0 && (
                <p className="mt-1 text-xs">
                  Tried lemmas: {token.lemmas.map((l) => l.lemma).join(', ')}
                </p>
              )}
            </div>
          )}

          {/* AI Explanation — placed above dictionary entries, matching Classic */}
          <AiExplanation
            word={token.text}
            contextText={context?.text}
            entryFound={entries.length > 0}
          />

          {/* Legacy saved words — unmatched to current dictionary */}
          {legacySavedWords.map((sw) => (
            <div
              key={sw.id}
              className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-semibold">{sw.forms[0] ?? token.text}</span>
                  </div>
                  {sw.forms.length > 1 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Also: {sw.forms.slice(1).join(', ')}
                    </p>
                  )}
                  {sw.context?.text && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      &ldquo;{sw.context.text}&rdquo;
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Legacy saved word — ID not recognized in current dictionary.
                  </p>
                </div>
                <button
                  onClick={() => removeSavedWord(l2.code, sw.id)}
                  className="shrink-0 rounded p-1 text-amber-500 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/50"
                  title="Remove this legacy saved word"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {entries.map((entry) => (
            <DictionaryEntryCard
              key={entry.id}
              entry={entry}
              levelLabel={levelLabel}
              onClick={handleEntryClick}
              saveContext={context}
            />
          ))}
        </div>
      </div>
    </>
  );
}
