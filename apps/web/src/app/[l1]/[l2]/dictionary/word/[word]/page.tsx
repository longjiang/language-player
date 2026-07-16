'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useT } from '@/hooks/use-t';
import { languageName, baseCode } from '@/lib/language-data';
import { resolveLegacyId } from '@/lib/legacy-word-resolver';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { DictionaryEntry } from '@langplayer/shared';
import { ArrowLeft, Loader2, AlertCircle, BookOpen, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { InflectionTable } from '@/components/inflection-table';
import { buildEntryRoute } from '@/lib/entry-route';

export default function WordDetailPage() {
  const params = useParams<{ l1: string; l2: string; word: string }>();
  const router = useRouter();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const word = decodeURIComponent(params.word ?? '');

  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { savedWords, removeSavedWord } = useSavedWordsContext();

  const lookupWord = useCallback(async (text: string) => {
    try {
      const res = await fetch(`${PYTHON_API_URL}/dictionary/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, l2: baseCode(l2.code), l1: l1.code }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.results ?? []) as DictionaryEntry[];
    } catch (err: any) {
      throw new Error(err?.message ?? 'Lookup failed');
    }
  }, [l1.code, l2.code]);

  useEffect(() => {
    if (!word) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    lookupWord(word)
      .then((results) => {
        if (!cancelled) {
          setEntries(results);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? 'Lookup failed');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [word, lookupWord]);

  const levelScaleLabel = (scale: string, value?: string | number): string => {
    // HSK: show as "HSK 3 (2025)"
    const hskMatch = scale.match(/^hsk_(\d{4})$/);
    if (hskMatch) return `HSK ${value ?? ''} (${hskMatch[1]})`.trim();
    const map: Record<string, string> = {
      jlpt: 'JLPT',
      cefr: 'CEFR',
    };
    const label = map[scale] ?? scale.toUpperCase();
    return value !== undefined ? `${label} ${value}` : label;
  };

  // Build context for SaveButton
  const saveContext = {
    form: word,
    text: word,
    textTitle: t('title.dictionary'),
  };

  // Find saved words for this word whose IDs don't match any loaded entry (legacy data)
  const unmatchedSavedWords = useMemo(() => {
    if (loading || error || !word) return [];
    const langWords = savedWords[l2.code] ?? [];
    const entryIds = new Set(entries.map((e) => e.id));
    const resolvedIds = new Set<string>();
    for (const e of entries) {
      const resolved = resolveLegacyId(e.id);
      if (resolved) resolvedIds.add(resolved);
    }

    return langWords.filter((sw) => {
      const formMatch = sw.forms.some(
        (f) => f.toLowerCase() === word.toLowerCase()
      );
      if (!formMatch) return false;
      if (entryIds.has(sw.id)) return false;
      const resolved = resolveLegacyId(sw.id);
      if (resolved && entryIds.has(resolved)) return false;
      return true;
    });
  }, [savedWords, l2.code, entries, word, loading, error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('action.back')}
      </button>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <span className="text-sm">{t('msg.loading')}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* No results */}
      {!loading && !error && entries.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            {t('error.entry_not_found')}
          </p>
        </div>
      )}

      {/* Unrecognized saved words (Tier 2 — legacy data) */}
      {!loading && unmatchedSavedWords.length > 0 && unmatchedSavedWords.map((sw) => (
        <div
          key={sw.id}
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                {t('msg.unrecognized_saved_word')}
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                <strong>{sw.forms.join(', ')}</strong>
                {sw.context?.text && sw.context.text !== word && (
                  <> — {t('msg.saved_from_context')} &ldquo;{sw.context.text.slice(0, 80)}{sw.context.text.length > 80 ? '…' : ''}&rdquo;</>
                )}
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {t('msg.unrecognized_saved_word_desc', { id: sw.id })}
              </p>
              <div className="mt-2">
                <button
                  onClick={() => removeSavedWord(l2.code, sw.id)}
                  className="inline-flex items-center gap-1 rounded bg-amber-200 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-200 dark:hover:bg-amber-700 transition-colors"
                >
                  {t('action.remove_and_resave')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Entries */}
      {!loading && !error && entries.length > 0 && (
        <div className="space-y-8">
          {entries.map((entry) => (
            <DictionaryEntryCard
              key={entry.id}
              variant="full"
              entry={entry}
              l2Code={l2.code}
              l1Code={l1.code}
              levelLabel={levelScaleLabel}
              saveContext={saveContext}
              onClick={(e) => router.push(buildEntryRoute(l1.code, l2.code, e.dictionary?.id ?? 'llm', e.id))}
            />
          ))}

          {/* Inflection / conjugation table for the queried word */}
          <InflectionTable
            head={entries[0]?.head ?? word}
            l2Code={l2.code}
          />
        </div>
      )}

    </div>
  );
}

