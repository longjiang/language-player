'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { DictionaryEntry } from '@langplayer/shared';
import { ArrowLeft, Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';

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

  const levelScaleLabel = (scale: string, value?: string | number): string => {
    const map: Record<string, string> = {
      hsk_2010: 'HSK',
      hsk_2026: 'HSK',
      jlpt: 'JLPT',
      cefr: 'CEFR',
    };
    const label = map[scale] ?? scale.toUpperCase();
    return value !== undefined ? `${label} ${value}` : label;
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
        <DictionaryEntryCard
          variant="full"
          entry={entry}
          l2Code={l2.code}
          l1Code={l1.code}
          levelLabel={levelScaleLabel}
          saveContext={saveContext}
        />
      )}
    </div>
  );
}
