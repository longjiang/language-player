'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { DictionaryEntry } from '@langplayer/shared';
import { ArrowLeft, Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { SaveButton } from '@/components/save-button';
import { SpeakButton } from '@/components/speak-button';
import { formatPronunciation } from '@langplayer/utils';
import { ExternalLink } from 'lucide-react';

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
  const { l1, l2 } = useLanguage();
  const t = useT();

  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `${PYTHON_API_URL}/dictionary/entry?l2=${baseCode(l2.code)}&dict=${encodeURIComponent(params.dictionaryId)}&id=${encodeURIComponent(params.entryId)}&l1=${l1.code}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Entry not found');
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

  const levelScaleLabel = (scale: string): string => {
    const map: Record<string, string> = {
      hsk_2010: 'HSK',
      hsk_2026: 'HSK',
      jlpt: 'JLPT',
      cefr: 'CEFR',
    };
    return map[scale] ?? scale.toUpperCase();
  };

  const saveContext = {
    form: entry?.head ?? '',
    text: entry?.head ?? '',
    textTitle: t('title.dictionary'),
  };

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

      {/* No entry */}
      {!loading && !error && !entry && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            {t('error.entry_not_found')}
          </p>
        </div>
      )}

      {/* Entry card */}
      {!loading && !error && entry && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {/* Header: head + alternate + pronunciation + level */}
          <div className="mb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <h1 className="text-4xl font-bold" lang={l2.code}>
                    {entry.head}
                  </h1>
                  {entry.alternate && entry.alternate !== entry.head && (
                    <span className="text-xl text-muted-foreground" lang={l2.code}>
                      {entry.alternate}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {(() => {
                    const pron = formatPronunciation(entry, l2.code);
                    if (pron) {
                      return (
                        <span className="flex items-center gap-1 text-lg text-muted-foreground" lang={l2.code}>
                          <SpeakButton text={entry.head} l2Code={l2.code} size="default" />
                          {pron}
                        </span>
                      );
                    }
                    return null;
                  })()}
                  {entry.level && (
                    <span className="rounded-md bg-blue-100 px-2.5 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {levelScaleLabel(entry.level.scale)} {entry.level.value}
                    </span>
                  )}
                  {entry.part_of_speech && (
                    <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground">
                      {entry.part_of_speech}
                    </span>
                  )}
                </div>
              </div>

              {/* Bookmark */}
              <SaveButton
                wordId={entry.id}
                head={entry.head}
                context={saveContext}
                size="default"
              />
            </div>
          </div>

          {/* Definitions */}
          {entry.definitions.length > 0 && (
            <div className="mb-6 rounded-lg bg-muted/40 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Definitions
              </h3>
              <ul className="space-y-2">
                {entry.definitions.map((def, i) => (
                  <li key={i} className="flex items-start gap-2 text-base leading-relaxed">
                    {entry.definitions.length > 1 && (
                      <span className="mt-0.5 flex-shrink-0 text-sm text-muted-foreground">
                        {i + 1}.
                      </span>
                    )}
                    <span>{def}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Han script detail */}
          {entry.han_script && (entry.han_script.traditional || entry.han_script.simplified) && (
            <div className="mb-6 flex gap-4 text-sm text-muted-foreground">
              {entry.han_script.simplified && entry.han_script.simplified !== entry.head && (
                <span>简: {entry.han_script.simplified}</span>
              )}
              {entry.han_script.traditional && entry.han_script.traditional !== entry.head && (
                <span>繁: {entry.han_script.traditional}</span>
              )}
            </div>
          )}

          {/* Phonetic detail */}
          {entry.phonetic_detail && typeof entry.phonetic_detail === 'object' && (
            <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground/70">
              {Object.entries(entry.phonetic_detail).map(([key, value]) => {
                if (typeof value === 'string' && value && key !== 'romaji' && key !== 'pinyin' && key !== 'jyutping') {
                  return <span key={key}>{key}: {value}</span>;
                }
                return null;
              })}
            </div>
          )}

          {/* Source */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            <span>{entry.dictionary?.name ?? entry.source}</span>
          </div>
        </div>
      )}
    </div>
  );
}
