import { useEffect, useState, useRef, useCallback } from 'react';
import type { SubtitleLine } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logerr } from '@/lib/logger';

const CHUNK_SIZE = 5;
/** How many chunks ahead of and behind the active line to translate. Only
 *  lines within ±LOOKAHEAD_CHUNKS of the playhead are ever translated — the
 *  rest stay untranslated until the playhead moves near them (matches web). */
const LOOKAHEAD_CHUNKS = 3;

type ChunkResult = 'success' | 'aborted' | 'error';

/**
 * Translates subtitle lines in chunks of 5, only for lines near the active
 * line (±LOOKAHEAD_CHUNKS). Lines far from the playhead are never translated —
 * they fill in as the user watches/scrolls. Ported from web.
 */
export function useSubtitleTranslation(
  l2Lines: SubtitleLine[],
  l1: string,
  l2: string,
  enabled: boolean,
  /** Current active subtitle line index (0-based) — used to prioritize. */
  activeIndex?: number,
  /** Optional per-line term to emphasize (parallel to l2Lines). */
  highlightForms?: (string | null | undefined)[],
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

  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // Reset state when subtitle lines change (new video).
  useEffect(() => {
    resultRef.current = new Array(l2Lines.length);
    translatedChunksRef.current = new Set();
    setTranslatedLines([]);
    setProgress(0);
    setLoading(enabled && l2Lines.length > 0);
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
      const res = await fetch(`${PYTHON_API_URL}/translate_array`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: chunk,
          l1,
          l2,
          ...(highlightForms
            ? { forms: chunk.map((_, i) => highlightForms[start + i] ?? null) }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const translated: string[] = data.translated_texts ?? [];

      // Guard against malformed responses — don't mark the chunk done if we
      // got fewer translations than lines.
      if (translated.length < chunk.length) {
        logerr(`Translation chunk ${chunkIdx}: expected ${chunk.length}, got ${translated.length}`);
        return 'error';
      }

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
      logerr('Translation chunk failed:', err);
      return 'error';
    }
  }, [l2Lines, l1, l2, highlightForms]);

  // Watcher: restart translation when the playhead moves into a new chunk region.
  useEffect(() => {
    if (!enabled || l2Lines.length === 0) return;
    const next = _pickNextChunk(activeIndex, translatedChunksRef.current, totalChunks);
    if (next !== -1) {
      setRetryCounter((c) => c + 1);
    }
  }, [activeIndex, enabled, l2Lines.length, totalChunks]);

  // Translation loop — translates lookahead chunks, then stops.
  useEffect(() => {
    if (!enabled || l2Lines.length === 0) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      setLoading(true);
      setError(null);

      while (true) {
        if (controller.signal.aborted) break;
        const next = _pickNextChunk(
          activeIndexRef.current,
          translatedChunksRef.current,
          totalChunks,
        );
        if (next === -1) break;
        const result = await translateChunk(next, controller);
        if (result === 'error') {
          setError('msg.translation_failed');
          break;
        }
        if (result === 'aborted') break;
      }

      if (!controller.signal.aborted) {
        setLoading(false);
      }
    };

    run();
    return () => { controller.abort(); };
  }, [enabled, l2Lines, l1, l2, totalChunks, translateChunk, retryCounter]);

  const retry = useCallback(() => {
    setRetryCounter((c) => c + 1);
  }, []);

  return { translatedLines, loading, progress, error, retry };
}

/** Pick the next chunk to translate within the lookahead window. */
function _pickNextChunk(
  activeIndex: number | undefined,
  done: Set<number>,
  totalChunks: number,
): number {
  const prio = activeIndex !== undefined && activeIndex >= 0
    ? Math.floor(activeIndex / CHUNK_SIZE)
    : 0;

  if (!done.has(prio)) return prio;

  for (let radius = 1; radius <= LOOKAHEAD_CHUNKS; radius++) {
    const ahead = prio + radius;
    if (ahead < totalChunks && !done.has(ahead)) return ahead;
    const behind = prio - radius;
    if (behind >= 0 && !done.has(behind)) return behind;
  }

  return -1;
}
