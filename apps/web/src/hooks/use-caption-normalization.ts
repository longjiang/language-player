'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { SubtitleLine } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logwarn } from '@/lib/logger';

const PYTHON_URL = PYTHON_API_URL;

/** Normalization chunk size — must match MAX_LINES_PER_CHUNK in
 *  zerotohero-python-server/app_caption_normalizer.py. */
const CHUNK_SIZE = 40;
/** How many chunks ahead of the active line to normalize. Only the chunk the
 *  playhead is in (the lines that are visible) plus one extra chunk of
 *  lookahead are ever cleaned — the rest stay raw until the playhead nears
 *  them, so a long auto-generated transcript is cleaned lazily. */
const LOOKAHEAD_CHUNKS = 1;
/** Minimum wait before auto-retrying a failed chunk. Chunk fetches can take
 *  several seconds (LLM cleanup), so a down endpoint must not be hammered on
 *  every playhead tick — but a seek back should eventually retry too. */
const RETRY_COOLDOWN_MS = 30_000;

type ChunkResult = 'success' | 'aborted' | 'error' | 'not_generated';

interface UseCaptionNormalizationOptions {
  /** YouTube video id — used to resolve the transcript on /timedtext/clean. */
  youtubeId?: string;
  /** Target-language code (L2) used when resolving the transcript. */
  l2Code?: string;
  /** Raw (un-normalized) subtitle lines, in display order. */
  lines: SubtitleLine[];
  /** Only true when the transcript is auto-generated — the only case
   *  SPEC-029 normalization applies to. */
  enabled: boolean;
  /** Current active subtitle line index (0-based), driven by the playhead. */
  activeIndex?: number;
}

/**
 * Progressively LLM-normalizes an auto-generated transcript (SPEC-029).
 *
 * The raw transcript is displayed immediately; this hook then cleans it in
 * chunks of 40 lines, only normalizing the chunk the playhead is in plus one
 * chunk of lookahead. Cleaned lines are returned as a sparse overlay
 * (normalizedLines[i] = cleaned text for line i, undefined = still raw), so
 * callers can swap them onto the original timestamps without re-fetching.
 *
 * Each chunk request is idempotent: the Flask backend caches every cleaned
 * chunk, so seeking back and forth never re-pays the LLM. If a chunk fails
 * the raw lines simply stay visible and the loop retries when the playhead
 * moves into a new chunk region (or via `retry()`).
 */
export function useCaptionNormalization({
  youtubeId,
  l2Code,
  lines,
  enabled,
  activeIndex,
}: UseCaptionNormalizationOptions): {
  /** Sparse overlay: normalizedLines[i] is the cleaned text for line i, or
   *  undefined while that line still shows the raw auto-generated text. */
  normalizedLines: (string | undefined)[];
  loading: boolean;
  /** Number of lines normalized so far (progress indicator). */
  progress: number;
  /** Total number of lines. */
  total: number;
  error: string | null;
  retry: () => void;
} {
  const [normalizedLines, setNormalizedLines] = useState<(string | undefined)[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Incremented to restart the normalization loop from outside (retry). */
  const [retryCounter, setRetryCounter] = useState(0);

  const overlayRef = useRef<(string | undefined)[]>([]);
  const doneChunksRef = useRef<Set<number>>(new Set());
  /** True while a chunk request is in flight — prevents the playhead watcher
   *  from aborting a mid-LLM request just because the active line ticked. */
  const fetchingRef = useRef(false);
  /** Set once the backend reports the transcript isn't auto-generated, so the
   *  loop stops permanently for this transcript. */
  const notGeneratedRef = useRef(false);
  /** When the last chunk failure happened — rate-limits auto-retries. */
  const lastErrorAtRef = useRef(0);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const total = lines.length;
  const totalChunks = total === 0 ? 0 : Math.ceil(total / CHUNK_SIZE);

  // ── Reset state when the transcript changes (new video / new lines) ──
  useEffect(() => {
    overlayRef.current = new Array(total);
    doneChunksRef.current = new Set();
    notGeneratedRef.current = false;
    lastErrorAtRef.current = 0;
    setNormalizedLines([]);
    setProgress(0);
    setError(null);
    setLoading(enabled && total > 0);
  }, [lines, youtubeId, enabled, total]);

  const normalizeChunk = useCallback(async (
    chunkIdx: number,
    controller: AbortController,
  ): Promise<ChunkResult> => {
    if (doneChunksRef.current.has(chunkIdx)) return 'success';
    if (!youtubeId || !l2Code) return 'error';

    const start = chunkIdx * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, total);
    if (start >= end) {
      doneChunksRef.current.add(chunkIdx);
      return 'success';
    }

    try {
      const res = await fetch(
        `${PYTHON_URL}/timedtext/clean?v=${encodeURIComponent(youtubeId)}&l2=${encodeURIComponent(l2Code)}&start=${start}&end=${end}`,
        { signal: controller.signal, cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data?.isGenerated === false) return 'not_generated';

      const cleaned = data?.lines;
      if (!Array.isArray(cleaned) || cleaned.length < end - start) {
        logwarn(
          `Caption normalization chunk ${chunkIdx}: expected ${end - start} lines, got ${Array.isArray(cleaned) ? cleaned.length : 'none'}. Retrying next cycle.`,
        );
        return 'error';
      }

      for (let i = 0; i < cleaned.length; i++) {
        const idx = start + i;
        const original = lines[idx]?.line ?? '';
        const cleanedText = typeof cleaned[i] === 'string' ? cleaned[i] : '';
        // Never swap a cleaned line in as empty text.
        overlayRef.current[idx] = cleanedText.trim() ? cleanedText : original;
      }

      doneChunksRef.current.add(chunkIdx);
      setNormalizedLines([...overlayRef.current]);
      setProgress(Math.min(doneChunksRef.current.size * CHUNK_SIZE, total));
      return 'success';
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return 'aborted';
      return 'error';
    }
  }, [youtubeId, l2Code, lines, total]);

  // ── Watcher: kick the loop when the playhead moves into a new chunk region ──
  useEffect(() => {
    if (!enabled || total === 0 || notGeneratedRef.current) return;
    const next = _pickNextChunk(activeIndex, doneChunksRef.current, totalChunks);
    if (next !== -1 && !fetchingRef.current) {
      if (Date.now() - lastErrorAtRef.current < RETRY_COOLDOWN_MS) return;
      setRetryCounter((c) => c + 1);
    }
  }, [activeIndex, enabled, total, totalChunks]);

  // ── Normalization loop — cleans the visible chunk + lookahead, then stops ──
  useEffect(() => {
    if (!enabled || total === 0 || notGeneratedRef.current) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);

      // Clean chunks within the lookahead window until all are done. The
      // loop re-checks priority (activeIndexRef) between chunks, so a seek
      // mid-run steers the next request at the newly visible chunk.
      while (true) {
        if (controller.signal.aborted) break;

        const next = _pickNextChunk(
          activeIndexRef.current,
          doneChunksRef.current,
          totalChunks,
        );
        if (next === -1) break; // all visible + lookahead chunks clean — stop

        fetchingRef.current = true;
        const result = await normalizeChunk(next, controller);
        fetchingRef.current = false;

        if (result === 'error') {
          lastErrorAtRef.current = Date.now();
          setError('caption-normalization-failed');
          break; // stop — don't hammer the server; retry when playhead moves
        }
        if (result === 'aborted') break;
        if (result === 'not_generated') {
          notGeneratedRef.current = true;
          break;
        }
      }

      if (!controller.signal.aborted) {
        setLoading(false);
      }
    };

    run();

    return () => {
      controller.abort();
    };
  }, [enabled, total, totalChunks, normalizeChunk, retryCounter]);

  const retry = useCallback(() => {
    lastErrorAtRef.current = 0;
    setRetryCounter((c) => c + 1);
  }, []);

  return { normalizedLines, loading, progress, total, error, retry };
}

/**
 * Pick the next chunk to normalize within the lookahead window.
 * Only the chunk containing the active line plus LOOKAHEAD_CHUNKS ahead are
 * eligible. Returns -1 when all chunks in the window are already clean.
 */
function _pickNextChunk(
  activeIndex: number | undefined,
  done: Set<number>,
  totalChunks: number,
): number {
  const prio = _chunkOf(activeIndex);

  // Visible chunk first
  if (!done.has(prio)) return prio;

  // Then the chunk(s) just ahead — the user is overwhelmingly going forward
  for (let radius = 1; radius <= LOOKAHEAD_CHUNKS; radius++) {
    const ahead = prio + radius;
    if (ahead < totalChunks && !done.has(ahead)) return ahead;
  }

  return -1; // all lookahead chunks normalized
}

/** Chunk index containing the active line (chunk 0 before playback starts). */
function _chunkOf(activeIndex: number | undefined): number {
  return activeIndex !== undefined && activeIndex >= 0
    ? Math.floor(activeIndex / CHUNK_SIZE)
    : 0;
}
