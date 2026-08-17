/**
 * Batched lemmatization queue shared by TokenizedText instances (mobile).
 *
 * Visible TokenizedText instances enqueue their line; a short timer flushes
 * the queue through /lemmatize-normalized/batch in one request instead of
 * firing N per-line calls. Falls back to lemmatizeText() (server-first with
 * local tokenizer fallback) when the batch request fails.
 * Extracted from components/TokenizedText.tsx (file-size refactor).
 */

import type { LemmatizedToken } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { tokenizedTextLogger } from '@/lib/logger';
import { lemmatizeText } from '@/lib/tokenizer';
import { isOfflineModeEnabled } from '@/lib/offline-mode';

const { log, logwarn } = tokenizedTextLogger;

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
      // Offline Mode: don't attempt the batch endpoint at all. The gate would
      // reject instantly anyway; skipping keeps the local fallback instant
      // and avoids the double failure (batch + per-line) in the logs.
      if (isOfflineModeEnabled()) {
        log('[TokenizedText] ⏭ OFFLINE-MODE — skipping /lemmatize-normalized/batch, using local lemmatizeText');
        await Promise.allSettled(group.map(async (item) => {
          try {
            item.resolve(await lemmatizeText(item.text, item.l2Code));
          } catch (lineErr) {
            item.reject(lineErr);
          } finally {
            lemmatizeBatchPending.delete(item.key);
          }
        }));
        continue;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: group.map((g) => g.text), l2: l2Code }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const results: LemmatizedToken[][] = data?.results ?? [];
          group.forEach((item, i) => {
            item.resolve(results[i] ?? []);
            lemmatizeBatchPending.delete(item.key);
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        // Batch failed — fall back to lemmatizeText() (server-first, then local
        // tokenizer), preserving the offline pipeline.
        logwarn('[LP Mobile] Batch lemmatize failed — falling back per-line:', err);
        await Promise.allSettled(group.map(async (item) => {
          try {
            item.resolve(await lemmatizeText(item.text, item.l2Code));
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
