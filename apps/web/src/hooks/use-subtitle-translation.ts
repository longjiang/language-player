'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { SubtitleLine } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';

const PYTHON_URL = PYTHON_API_URL;
const CHUNK_SIZE = 5;
/** How many chunks ahead of the active line to pre-translate before continuing sequentially. */
const LOOKAHEAD_CHUNKS = 3;

/** Result of a single chunk translation attempt. */
type ChunkResult = 'success' | 'aborted' | 'error';

/**
 * Translates subtitle lines in chunks of 5, prioritizing lines near the
 * user's current position. Chunk 0 (top of transcript) is always first.
 *
 * Uses a ref-based priority check so the translation loop isn't restarted
 * on every frame when activeIndex changes — it re-checks the user's
 * position before each chunk and adjusts accordingly.
 *
 * If a chunk fails (e.g. server unreachable), the loop stops immediately
 * rather than hammering the server with 59 more failing requests.
 * Call `retry()` to resume translation once the server is back.
 */
export function useSubtitleTranslation(
  l2Lines: SubtitleLine[],
  l1: string,
  l2: string,
  enabled: boolean,
  /** Current active subtitle line index (0-based). Used to prioritize translation. */
  activeIndex?: number,
): { translatedLines: SubtitleLine[]; loading: boolean; progress: number; error: string | null; retry: () => void } {
  const [translatedLines, setTranslatedLines] = useState<SubtitleLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<SubtitleLine[]>([]);
  const translatedChunksRef = useRef<Set<number>>(new Set());
  const totalChunks = l2Lines.length === 0 ? 0 : Math.ceil(l2Lines.length / CHUNK_SIZE);
  /** Incremented to restart the translation loop from outside (retry). */
  const [retryCounter, setRetryCounter] = useState(0);

  // Keep a ref in sync with activeIndex so the translation loop can
  // re-check priority without restarting on every frame update.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // ── Reset state when subtitle lines change (new video) ──
  useEffect(() => {
    resultRef.current = new Array(l2Lines.length);
    translatedChunksRef.current = new Set();
    setTranslatedLines([]);
    setProgress(0);
    setLoading(true);
    setError(null);
  }, [l2Lines]);

  const translateChunk = useCallback(async (
    chunkIdx: number,
    controller: AbortController,
  ): Promise<ChunkResult> => {
    if (translatedChunksRef.current.has(chunkIdx)) return 'success';

    const start = chunkIdx * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, l2Lines.length);
    const chunk = l2Lines.slice(start, end).map((s) => s.line);

    try {
      const res = await fetch(`${PYTHON_URL}/translate_array`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: chunk, l1, l2 }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const translated = data.translated_texts ?? [];

      for (let i = 0; i < translated.length; i++) {
        const idx = start + i;
        resultRef.current[idx] = {
          line: translated[i] ?? '',
          starttime: l2Lines[idx]!.starttime,
        };
      }

      translatedChunksRef.current.add(chunkIdx);
      const doneCount = translatedChunksRef.current.size * CHUNK_SIZE;
      setTranslatedLines([...resultRef.current]);
      setProgress(Math.min(doneCount, l2Lines.length));
      return 'success';
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return 'aborted';
      return 'error';
    }
  }, [l2Lines, l1, l2]);

  // ── Translation loop — runs once per video, re-checks priority via ref ──
  useEffect(() => {
    if (!enabled || l2Lines.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      setLoading(true);
      setError(null);

      // Keep translating chunks until all done, aborted, or an error occurs.
      // Re-check the user's position (via ref) before each chunk
      // so scrolling re-prioritizes without restarting the loop.
      while (translatedChunksRef.current.size < totalChunks) {
        if (controller.signal.aborted) break;

        const next = _pickNextChunk(
          activeIndexRef.current,
          translatedChunksRef.current,
          totalChunks,
        );
        if (next === -1) break; // all done

        const result = await translateChunk(next, controller);
        if (result === 'error') {
          setError('msg.translation_failed');
          break; // stop — don't hammer the server
        }
        if (result === 'aborted') break;
      }

      if (!controller.signal.aborted) {
        setLoading(false);
      }
    };

    run();

    return () => {
      controller.abort();
    };
  }, [enabled, l2Lines, l1, l2, totalChunks, translateChunk, retryCounter]);

  const retry = useCallback(() => {
    setRetryCounter((c) => c + 1);
  }, []);

  return { translatedLines, loading, progress, error, retry };
}

/**
 * Pick the next chunk to translate based on priority:
 * 1. Chunk 0 (top of transcript — always first)
 * 2. Chunks around the active line (±LOOKAHEAD_CHUNKS radius)
 * 3. Remaining untranslated chunks in order (background fill)
 */
function _pickNextChunk(
  activeIndex: number | undefined,
  done: Set<number>,
  totalChunks: number,
): number {
  const prio = activeIndex !== undefined && activeIndex >= 0
    ? Math.floor(activeIndex / CHUNK_SIZE)
    : 0;

  // 1. Chunk 0
  if (!done.has(0)) return 0;

  // 2. Chunks around active line, expanding outward
  for (let radius = 0; radius <= LOOKAHEAD_CHUNKS; radius++) {
    for (const offset of [radius, -radius]) {
      const c = prio + offset;
      if (c >= 0 && c < totalChunks && !done.has(c)) return c;
    }
  }

  // 3. First remaining untranslated chunk (sequential fill)
  for (let c = 0; c < totalChunks; c++) {
    if (!done.has(c)) return c;
  }

  return -1; // all done
}
