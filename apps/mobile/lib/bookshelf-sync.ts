/**
 * SPEC-053 Phase 2 — EPUB bookshelf sync.
 *
 * The bookshelf itself (book files/covers) stays local; only the shelf
 * metadata (titles, authors, reading progress, timestamps) syncs through the
 * durable outbox so another device can resume reading.
 */

import { listEpubs } from '@/lib/epub-store';
import { enqueueSyncOp } from '@/lib/sync-engine';
import { logwarn } from '@/lib/logger';

export async function syncBookshelfToServer(): Promise<void> {
  try {
    const books = await listEpubs();
    await enqueueSyncOp({
      entity: 'bookshelf',
      entityId: 'default',
      op: 'upsert',
      payload: { books },
      updatedAt: Date.now(),
    });
  } catch (e) {
    logwarn('[bookshelf-sync] enqueue failed:', (e as Error)?.message ?? e);
  }
}
