/**
 * useTranslateLines — hook for lazy batch-translating subtitle lines.
 *
 * Only translates lines within a window around the active cue, similar to
 * how useBatchLemmatize lazy-loads tokens. As the active cue advances,
 * newly-visible lines are fetched in chunks of 5 from /translate_array.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

import { API_BASE } from './api-config';
import { log, logwarn } from './i18n';

const CHUNK_SIZE = 5;
/** Number of lines ahead of the active cue to pre-translate. */
const LOOKAHEAD = 15;

export interface SubCue {
  start: number;
  end: number;
  text: string;
}

interface UseTranslateLinesResult {
  translated: Map<number, string>; // index → L1 text
  loading: boolean;
  progress: number;
}

export function useTranslateLines(
  cues: SubCue[],
  l1Code: string,
  l2Code: string,
  activeCueIdx: number,
  enabled: boolean,
): UseTranslateLinesResult {
  const [translated, setTranslated] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inFlightRef = useRef<Set<number>>(new Set());
  const fetchedRef = useRef<Set<number>>(new Set());
  const cuesRef = useRef(cues);
  cuesRef.current = cues;

  const fetchChunk = useCallback(async (start: number) => {
    const cues = cuesRef.current;
    const end = Math.min(start + CHUNK_SIZE, cues.length);
    const chunk: string[] = [];
    const indices: number[] = [];
    for (let i = start; i < end; i++) {
      if (!fetchedRef.current.has(i) && !inFlightRef.current.has(i)) {
        chunk.push(cues[i].text);
        indices.push(i);
        inFlightRef.current.add(i);
      }
    }
    if (chunk.length === 0) return;

    setLoading(true);
    try {
      const controller = new AbortController();
      const res = await fetch(`${API_BASE}/translate_array`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: chunk, l1: l1Code, l2: l2Code }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const translatedTexts: string[] = data.translated_texts ?? [];

      setTranslated(prev => {
        const next = new Map(prev);
        for (let i = 0; i < translatedTexts.length; i++) {
          const idx = indices[i];
          if (idx !== undefined) {
            next.set(idx, translatedTexts[i]!);
            fetchedRef.current.add(idx);
          }
        }
        return next;
      });
      setProgress(fetchedRef.current.size);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      logwarn('Translation chunk failed:', err);
    } finally {
      for (const idx of indices) {
        inFlightRef.current.delete(idx);
      }
      setLoading(false);
    }
  }, [l1Code, l2Code]);

  // When cues change (new video), reset everything
  useEffect(() => {
    setTranslated(new Map());
    setProgress(0);
    fetchedRef.current = new Set();
    inFlightRef.current = new Set();
    setLoading(false);
  }, [cues]);

  // Lazy: when enabled, translate chunks around the active cue
  useEffect(() => {
    if (!enabled) return;
    if (cues.length === 0) return;
    const start = Math.max(0, activeCueIdx);
    const end = Math.min(cues.length, activeCueIdx + LOOKAHEAD);
    for (let i = start; i < end; i += CHUNK_SIZE) {
      fetchChunk(i);
    }
  }, [enabled, activeCueIdx, cues.length, fetchChunk]);

  return { translated, loading, progress };
}
