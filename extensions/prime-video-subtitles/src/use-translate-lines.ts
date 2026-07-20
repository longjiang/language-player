/**
 * useTranslateLines — hook for batch-translating subtitle lines.
 *
 * Mirrors the web app's useSubtitleTranslation but adapted for the extension.
 * Fetches translations in chunks of 5 from /translate_array.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const CHUNK_SIZE = 5;
const API_BASE = 'https://pythonvps.zerotohero.ca';

export interface SubCue {
  start: number;
  end: number;
  text: string;
}

interface UseTranslateLinesResult {
  translated: Map<number, string>; // index → L1 text
  loading: boolean;
  progress: number;
  start: () => void;
  reset: () => void;
}

export function useTranslateLines(
  cues: SubCue[],
  l1Code: string,
  l2Code: string,
  enabled: boolean,
): UseTranslateLinesResult {
  const [translated, setTranslated] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const doneRef = useRef(false);

  const start = useCallback(async () => {
    if (!enabled || cues.length === 0) return;
    if (doneRef.current) return; // already translated

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setProgress(0);
    setTranslated(new Map());

    const lines = cues.map(c => c.text);
    const total = lines.length;
    const result = new Map<number, string>();

    for (let start = 0; start < total; start += CHUNK_SIZE) {
      if (controller.signal.aborted) break;
      const end = Math.min(start + CHUNK_SIZE, total);
      const chunk = lines.slice(start, end);

      try {
        const res = await fetch(`${API_BASE}/translate_array`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: chunk, l1: l1Code, l2: l2Code }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const translatedTexts: string[] = data.translated_texts ?? [];
        for (let i = 0; i < translatedTexts.length; i++) {
          result.set(start + i, translatedTexts[i]!);
        }
        setTranslated(new Map(result));
        setProgress(Math.min(end, total));
      } catch (err: any) {
        if (err.name === 'AbortError' || controller.signal.aborted) break;
        console.warn('[LPV] Translation chunk failed:', err);
        break;
      }
    }

    if (!controller.signal.aborted) {
      setLoading(false);
      setProgress(total);
      doneRef.current = true;
    }
  }, [cues, l1Code, l2Code, enabled]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTranslated(new Map());
    setLoading(false);
    setProgress(0);
    doneRef.current = false;
  }, []);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      reset();
    }
  }, [enabled]);

  return { translated, loading, progress, start, reset };
}
