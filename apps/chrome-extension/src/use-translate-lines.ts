/**
 * useTranslateLines — hook for lazy batch-translating subtitle lines.
 *
 * Translates only the lines inside the rolling window around the active cue
 * (see lazy-window.ts), matching apps/web + apps/mobile (SPEC-021: chunks of
 * 5, ±3 chunks). As the active cue advances, newly-in-window chunks are
 * fetched while already-translated chunks are preserved.
 *
 * Reset semantics (fixes the "translation disappears as the video plays" bug):
 * the `cues` prop arrives from the side-panel host and is structured-cloned
 * over the messaging port, so its array reference changes on every panel-state
 * push. The translation map must NOT reset on a mere reference change — only
 * when the cue content actually changes (new video/track) or the language pair
 * changes. We reset on a content signature instead of `cues` identity.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

import { API_BASE } from './api-config';
import { apiFetch } from './api-fetch';
import { WINDOW_CHUNK_SIZE, orderedWindowChunks } from './lazy-window';
import { logwarn } from './i18n';

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
  const chunksInFlightRef = useRef<Set<number>>(new Set());
  const chunksFetchedRef = useRef<Set<number>>(new Set());
  const cuesRef = useRef(cues);
  cuesRef.current = cues;

  // ── Reset on a meaningful change, not on a cues-reference change ──
  // Cloning over the messaging port changes `cues` identity on every push, so
  // resetting on `[cues]` cleared the whole translation map each time the video
  // advanced. Reset only when the cue content or the language pair changes.
  const resetKey = useMemo(() => {
    const first = cues[0]?.text ?? '';
    const last = cues[cues.length - 1]?.text ?? '';
    return `${l1Code}\u0000${l2Code}\u0000${cues.length}\u0000${first}\u0000${last}`;
  }, [cues, l1Code, l2Code]);

  useEffect(() => {
    setTranslated(new Map());
    setProgress(0);
    chunksFetchedRef.current = new Set();
    chunksInFlightRef.current = new Set();
    setLoading(false);
  }, [resetKey]);

  const fetchChunk = useCallback(async (chunkIdx: number) => {
    const cues = cuesRef.current;
    if (chunksFetchedRef.current.has(chunkIdx) || chunksInFlightRef.current.has(chunkIdx)) return;

    const start = chunkIdx * WINDOW_CHUNK_SIZE;
    const end = Math.min(start + WINDOW_CHUNK_SIZE, cues.length);
    const chunk: string[] = [];
    const indices: number[] = [];
    for (let i = start; i < end; i++) {
      chunk.push(cues[i].text);
      indices.push(i);
    }
    if (chunk.length === 0) return;

    chunksInFlightRef.current.add(chunkIdx);
    setLoading(true);
    try {
      const controller = new AbortController();
      const res = await apiFetch(`${API_BASE}/translate_array`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: chunk, l1: l1Code, l2: l2Code }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const translatedTexts: string[] = data.translated_texts ?? [];

      setTranslated((prev) => {
        const next = new Map(prev);
        for (let i = 0; i < translatedTexts.length; i++) {
          const idx = indices[i];
          if (idx !== undefined) next.set(idx, translatedTexts[i] ?? '');
        }
        return next;
      });
      // Mark the chunk done once the server acknowledges it (even a partial
      // array means the chunk was attempted); avoid re-hammering the endpoint.
      chunksFetchedRef.current.add(chunkIdx);
      setProgress(Math.min(chunksFetchedRef.current.size * WINDOW_CHUNK_SIZE, cues.length));
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      logwarn('Translation chunk failed:', err);
    } finally {
      chunksInFlightRef.current.delete(chunkIdx);
      setLoading(false);
    }
  }, [l1Code, l2Code]);

  // Lazy: when enabled, translate every chunk in the rolling window (priority
  // chunks first). Already-fetched chunks are skipped inside fetchChunk, so
  // translations persist as the active cue advances instead of being cleared.
  useEffect(() => {
    if (!enabled) return;
    if (cues.length === 0) return;
    const chunks = orderedWindowChunks(activeCueIdx, cues.length);
    for (const chunkIdx of chunks) {
      fetchChunk(chunkIdx);
    }
  }, [enabled, activeCueIdx, cues.length, fetchChunk]);

  return { translated, loading, progress };
}
