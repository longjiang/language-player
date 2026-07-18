/**
 * Client-side token cache for video subtitles.
 * Populated from GET /lemmatize-video-normalized and used to skip
 * per-line /lemmatize-normalized API calls during playback.
 */

import type { LemmatizedToken } from '@langplayer/shared';
import { md5 } from './md5';

/**
 * Simple map-based token cache. Keyed by md5(text) → LemmatizedToken[].
 * Matches the server's md5(line) cache keys exactly.
 */
export class TokenCache {
  private map = new Map<string, LemmatizedToken[]>();

  /** Populate from the server's normalized hash table response. */
  load(hashTable: Record<string, { tokens: LemmatizedToken[] }>): void {
    for (const [hash, entry] of Object.entries(hashTable)) {
      if (entry.tokens?.length > 0) {
        this.map.set(hash, entry.tokens);
      }
    }
  }

  /** Look up cached tokens by original text. Returns undefined on miss. */
  get(text: string): LemmatizedToken[] | undefined {
    const hash = md5(text);
    return this.map.get(hash);
  }

  /** Number of cached entries. */
  get size(): number {
    return this.map.size;
  }

  /** Clear all cached entries. */
  clear(): void {
    this.map.clear();
  }
}
