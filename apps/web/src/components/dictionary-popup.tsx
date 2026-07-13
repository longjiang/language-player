'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { LemmatizedToken, DictionaryEntry } from '@langplayer/shared';
import { Loader2, X, AlertCircle } from 'lucide-react';
import { DictionaryEntryCard } from './dictionary-entry-card';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5001';

interface DictionaryPopupProps {
  token: LemmatizedToken;
  l1Code: string;
  l2Code: string;
  position?: { x: number; y: number };
  onClose: () => void;
}

/** Fetches dictionary entries for a token and displays them in a popover. */
export function DictionaryPopup({
  token,
  l1Code,
  l2Code,
  onClose,
}: DictionaryPopupProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lookupWord = useCallback(async (text: string, signal: AbortSignal) => {
    try {
      const res = await fetch(`${API_BASE}/dictionary/lookup`, {
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
    router.push(`/${l1Code}/${l2Code}/dictionary?q=${encodeURIComponent(entry.head)}`);
  };

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
            {token.lemmas.length > 0 && token.lemmas[0].lemma !== token.text && (
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
            <div className="flex items-center gap-2 py-8 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              <span className="text-sm">Looking up...</span>
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

          {entries.map((entry) => (
            <DictionaryEntryCard
              key={entry.id}
              entry={entry}
              levelLabel={levelLabel}
              onClick={handleEntryClick}
            />
          ))}
        </div>
      </div>
    </>
  );
}
