'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { LemmatizedToken, DictionaryEntry, SavedWordContext, SavedLexicalItemRecord, SavedLexicalItemInstance, ProficiencyLevel } from '@langplayer/shared';
import { normalizeInstances } from '@/hooks/use-saved-words';
import { formatLevel } from '@langplayer/shared';
import { Loader2, X, AlertCircle, AlertTriangle } from 'lucide-react';
import { DictionaryEntryCard } from './dictionary-entry-card';
import { AiExplanation } from './ai-explanation';
import { SaveButton } from './save-button';
import { useT } from '@/hooks/use-t';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { resolveLegacyId } from '@/lib/legacy-word-resolver';
import { baseCode } from '@/lib/language-data';
import { formatPronunciation } from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';
import { WordList } from '@/components/dictionary/word-list';
import { buildEntryRoute } from '@/lib/entry-route';

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
  const t = useT();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { savedWords, removeSavedWord } = useSavedWordsContext();

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

  const levelLabel = (scale: string, value: string | number) => formatLevel({ scale, value } as ProficiencyLevel).long;

  // Find saved words for this token whose IDs don't match any loaded entry
  const unmatchedSavedWords = useMemo(() => {
    if (loading || error) return [];
    const langWords = savedWords[l2Code] ?? [];
    const entryIds = new Set(entries.map((e) => e.id));
    // Also include resolved legacy IDs in the match check
    const resolvedIds = new Set<string>();
    for (const e of entries) {
      const resolved = resolveLegacyId(e.id);
      if (resolved) resolvedIds.add(resolved);
    }

    return langWords.filter((sw) => {
      // Check if this saved word's forms include the token text
      const formMatch = sw.forms.some(
        (f) => f.toLowerCase() === token.text.toLowerCase()
      );
      if (!formMatch) return false;
      // Check if this saved word's ID matches any entry (direct or resolved)
      if (entryIds.has(sw.id)) return false;
      const resolved = resolveLegacyId(sw.id);
      if (resolved && entryIds.has(resolved)) return false;
      return true;
    });
  }, [savedWords, l2Code, entries, token.text, loading, error]);

  const handleEntryClick = (entry: DictionaryEntry) => {
    router.push(buildEntryRoute(l1Code, l2Code, entry.dictionary?.id ?? 'llm', entry.id));
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
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
                [{token.pronunciation}]
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
              <p>{t('msg.no_dictionary_entry', { word: token.text })}</p>
              {token.lemmas.length > 0 && (
                <p className="mt-1 text-xs">
                  {t('msg.tried_lemmas')}: {token.lemmas.map((l) => l.lemma).join(', ')}
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

          {/* Unrecognized saved words (Tier 2 — legacy data) */}
          {!loading && unmatchedSavedWords.length > 0 && unmatchedSavedWords.map((sw) => (
            <div
              key={sw.id}
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {t('msg.unrecognized_saved_word')}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                    <strong>{sw.forms.join(', ')}</strong>
                    {(() => {
                      const insts = normalizeInstances(sw);
                      const ctx = insts[insts.length - 1]?.context;
                      return ctx?.text ? (
                        <> — {t('msg.saved_from_context')} &ldquo;{ctx.text.slice(0, 80)}{ctx.text.length > 80 ? '…' : ''}&rdquo;</>
                      ) : null;
                    })()}
                  </p>
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {t('msg.unrecognized_saved_word_desc', { id: sw.id })}
                  </p>
                  <div className="mt-2">
                    <button
                      onClick={() => removeSavedWord(l2Code, sw.id)}
                      className="inline-flex items-center gap-1 rounded bg-amber-200 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-200 dark:hover:bg-amber-700 transition-colors"
                    >
                      {t('action.remove_and_resave')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <WordList>
            {entries.map((entry) => (
              <DictionaryEntryCard
                key={entry.id}
                entry={entry}
                levelLabel={levelLabel}
                onClick={handleEntryClick}
                saveContext={context}
                pronunciation={formatPronunciation(entry, l2Code)}
                l2Code={l2Code}
              />
            ))}
          </WordList>
        </div>
      </div>
    </div>
  );
}
