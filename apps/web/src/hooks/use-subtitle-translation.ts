'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { SubtitleLine } from '@langplayer/shared';

const PYTHON_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pythonvps.zerotohero.ca';
const CHUNK_SIZE = 5;

/**
 * Translates subtitle lines in chunks of 5, updating state progressively.
 * Ported from Classic's autoTranslateMixin.js.
 */
export function useSubtitleTranslation(
  l2Lines: SubtitleLine[],
  l1: string,
  l2: string,
  enabled: boolean,
): { translatedLines: SubtitleLine[]; loading: boolean; progress: number } {
  const [translatedLines, setTranslatedLines] = useState<SubtitleLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const translate = useCallback(async () => {
    if (!enabled || l2Lines.length === 0) return;

    // Cancel any previous translation
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setProgress(0);
    setTranslatedLines([]);

    const lines = l2Lines.map((s) => s.line);
    const total = lines.length;
    const result: SubtitleLine[] = [];

    for (let start = 0; start < total; start += CHUNK_SIZE) {
      if (controller.signal.aborted) break;

      const end = Math.min(start + CHUNK_SIZE, total);
      const chunk = lines.slice(start, end);

      try {
        const res = await fetch(`${PYTHON_URL}/translate_array`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: chunk, l1, l2 }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Translation failed: ${res.status}`);

        const data = await res.json();
        const translated = data.translated_texts ?? [];

        for (let i = 0; i < translated.length; i++) {
          const idx = start + i;
          result[idx] = {
            line: translated[i] ?? '',
            starttime: l2Lines[idx]!.starttime,
          };
        }

        setTranslatedLines([...result]);
        setProgress(Math.min(end, total));
      } catch (err: any) {
        if (err?.name === 'AbortError' || controller.signal.aborted) break;
        console.error('Translation chunk failed:', err);
        break;
      }
    }

    if (!controller.signal.aborted) {
      setLoading(false);
      setProgress(total);
    }
  }, [l2Lines, l1, l2, enabled]);

  useEffect(() => {
    translate();
    return () => {
      abortRef.current?.abort();
    };
  }, [translate]);

  return { translatedLines, loading, progress };
}
