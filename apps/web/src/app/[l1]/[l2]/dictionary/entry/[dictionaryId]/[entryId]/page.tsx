'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useDictionaryContext } from '@/providers/dictionary-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { DictionaryEntry, ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';

/**
 * Single dictionary or LLM entry page.
 *
 * Route: /[l1]/[l2]/dictionary/entry/[dictionaryId]/[entryId]
 *
 * Fetches the entry from the backend and renders it in the main panel.
 * The persistent search bar, back button, and sidebar are handled by layout.tsx.
 */
export default function DictionaryEntryPage() {
  const params = useParams<{
    l1: string;
    l2: string;
    dictionaryId: string;
    entryId: string;
  }>();
  const searchParams = useSearchParams();
  const { l1, l2 } = useLanguage();
  const t = useT();

  const { setDetailHead } = useDictionaryContext();

  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dictionaryId = params.dictionaryId;
  const rawEntryId = params.entryId;

  const fetchEntry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryL2 = baseCode(params.l2);
      const queryL1 = baseCode(params.l1);
      // CEDICT IDs contain commas (Classic format), encoded as ~ in the URL path
      const entryId = decodeURIComponent(rawEntryId).replace(/~/g, ',');
      const url = `${PYTHON_API_URL}/dictionary/entry?l2=${queryL2}&dict=${encodeURIComponent(dictionaryId)}&id=${encodeURIComponent(entryId)}&l1=${queryL1}`;
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
      const entryData: DictionaryEntry | undefined = data.entry;
      setEntry(entryData ?? null);

      // Update the search bar to show the head word
      if (entryData?.head) {
        setDetailHead(entryData.head);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load entry');
    }
    setLoading(false);
  }, [params.l2, params.l1, dictionaryId, rawEntryId, t, setDetailHead]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  const levelLabel = (scale: string, value: string | number) =>
    formatLevel({ scale, value } as ProficiencyLevel).long;

  const saveContext = {
    form: entry?.head ?? '',
    text: entry?.head ?? '',
    textTitle: t('title.dictionary'),
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  // ── No entry ──
  if (!entry) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            {t('error.entry_not_found')}
          </p>
        </div>
      </div>
    );
  }

  // ── Entry ──
  return (
    <div className="p-6">
      <DictionaryEntryCard
        variant="full"
        entry={entry}
        l2Code={l2.code}
        l1Code={l1.code}
        levelLabel={levelLabel}
        saveContext={saveContext}
      />
    </div>
  );
}
