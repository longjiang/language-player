'use client';

/**
 * Batched lemmatization queue shared by TokenizedText instances (web).
 *
 * Visible TokenizedText instances enqueue their line; a short timer flushes
 * the queue through /lemmatize-normalized/batch in one request instead of
 * firing N per-line calls. Falls back to per-line requests on failure.
 * Extracted from components/tokenized-text.tsx (file-size refactor).
 */

import type { LemmatizedToken } from '@langplayer/shared';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';

// Simple in-memory cache to avoid re-lemmatizing the same text
export const lemmatizeCache = new Map<string, LemmatizedToken[]>();

// In-flight request deduplication — prevents thundering herd when many
// TokenizedText instances mount simultaneously and all hit the fallback.
export const lemmatizeInflight = new Map<string, Promise<LemmatizedToken[]>>();

interface LemmatizeBatchItem {
  key: string;
  text: string;
  l2Code: string;
  resolve: (tokens: LemmatizedToken[]) => void;
  reject: (err: unknown) => void;
}

const lemmatizeBatchQueue: LemmatizeBatchItem[] = [];
const lemmatizeBatchPending = new Map<string, Promise<LemmatizedToken[]>>();
const LEMMATIZE_BATCH_MAX = 12;
const LEMMATIZE_BATCH_DELAY_MS = 60;
let lemmatizeBatchTimer: ReturnType<typeof setTimeout> | null = null;

/** Queue a line for batched lemmatization; resolves with its tokens. */
export function enqueueLemmatize(text: string, l2Code: string): Promise<LemmatizedToken[]> {
  const key = `${l2Code}:${text}`;
  const existing = lemmatizeBatchPending.get(key);
  if (existing) return existing;

  const promise = new Promise<LemmatizedToken[]>((resolve, reject) => {
    lemmatizeBatchQueue.push({ key, text, l2Code, resolve, reject });
  });
  lemmatizeBatchPending.set(key, promise);
  scheduleLemmatizeBatchFlush();
  return promise;
}

function scheduleLemmatizeBatchFlush() {
  if (lemmatizeBatchTimer) return;
  lemmatizeBatchTimer = setTimeout(() => {
    lemmatizeBatchTimer = null;
    void flushLemmatizeBatch();
  }, LEMMATIZE_BATCH_DELAY_MS);
}

async function flushLemmatizeBatch() {
  // Drain the whole queue in chunks — lines beyond LEMMATIZE_BATCH_MAX that
  // enqueued before this flush must not be stranded until a later enqueue.
  while (lemmatizeBatchQueue.length > 0) {
    const items = lemmatizeBatchQueue.splice(0, LEMMATIZE_BATCH_MAX);
    if (items.length === 0) break;

    // Batch endpoint takes one language per call — group the queue by l2.
    const byL2 = new Map<string, LemmatizeBatchItem[]>();
    for (const item of items) {
      const group = byL2.get(item.l2Code);
      if (group) group.push(item);
      else byL2.set(item.l2Code, [item]);
    }

    for (const [l2Code, group] of byL2) {
      try {
        const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: group.map((g) => g.text), l2: baseCode(l2Code) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const results: LemmatizedToken[][] = data?.results ?? [];
        group.forEach((item, i) => {
          const tokens = results[i] ?? [];
          lemmatizeCache.set(item.key, tokens);
          item.resolve(tokens);
          lemmatizeBatchPending.delete(item.key);
        });
      } catch (err) {
        // Batch request failed — fall back to per-line requests so nothing is lost.
        await Promise.allSettled(group.map(async (item) => {
          try {
            const tokens = await fetchLemmatizeLine(item.text, item.l2Code);
            lemmatizeCache.set(item.key, tokens);
            item.resolve(tokens);
          } catch (lineErr) {
            item.reject(lineErr);
          } finally {
            lemmatizeBatchPending.delete(item.key);
          }
        }));
      }
    }
  }
}

/** Single-line /lemmatize-normalized request (batch failure fallback). */
async function fetchLemmatizeLine(text: string, l2Code: string): Promise<LemmatizedToken[]> {
  const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, l2: baseCode(l2Code) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.tokens as LemmatizedToken[];
}
