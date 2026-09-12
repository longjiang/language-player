/**
 * Base URL for textbook media (SPEC-095, ADR-0043).
 *
 * Textbook audio and images are ~29 MB per unit, so they are not committed and
 * not bundled into the app binary — they are published to the shared host and
 * addressed through this single constant. Content files store relative asset
 * keys, so changing host is a change to this value plus a re-upload.
 *
 * The shared host is the DEFAULT, in development and production alike — the
 * media lives on the server, so there is no local-path default. To serve assets
 * locally instead (offline work, or after a re-extraction), set
 * EXPO_PUBLIC_ASSET_URL to wherever they are served from.
 *
 * The URL itself lives in `@langplayer/textbooks` so the two apps cannot drift.
 *
 * Mirrors `api-url.ts` on both platforms: import this rather than reading
 * `process.env` at a call site.
 */

import { DEFAULT_TEXTBOOK_ASSET_BASE_URL } from '@langplayer/textbooks';

/** The base URL textbook media is resolved against. */
export const ASSET_BASE_URL: string =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ASSET_URL) ||
  DEFAULT_TEXTBOOK_ASSET_BASE_URL;
