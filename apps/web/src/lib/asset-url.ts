/**
 * Base URL for textbook media (SPEC-095, ADR-0043).
 *
 * Textbook audio and images are ~29 MB per unit, so they are not committed and
 * not bundled — they are published to the shared host and addressed through
 * this single constant. Content files store relative asset keys, so moving to a
 * different host later is a change to this value plus a re-upload, with no
 * content edits and no client changes.
 *
 * The shared host is the DEFAULT, in development and production alike. There is
 * deliberately no local-path default: the media lives on the server, and a
 * default pointing at a path nothing serves silently renders fallbacks while
 * looking configured. To serve assets locally instead (offline work, or after a
 * re-extraction), set NEXT_PUBLIC_ASSET_URL to wherever they are served from.
 *
 * The URL itself lives in `@langplayer/textbooks` so the two apps cannot drift.
 *
 * Mirrors `api-url.ts`: the shared module is the single source of truth, and
 * callers must import this rather than reading `process.env` directly.
 */

import { DEFAULT_TEXTBOOK_ASSET_BASE_URL } from '@langplayer/textbooks';

/** The base URL textbook media is resolved against. */
export const ASSET_BASE_URL: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ASSET_URL) ||
  DEFAULT_TEXTBOOK_ASSET_BASE_URL;

/**
 * Base URL the mock app HTML is served from (SPEC-095, ADR-0045).
 *
 * Mock apps are code, not media, so they are NOT on the asset host: they live in
 * this app's `public/mock-apps/` and are served same-origin, which keeps them
 * reviewable in git and avoids a cross-origin surface. Only the frame's sandbox
 * keeps them away from the host document.
 */
export const MOCK_APP_BASE_URL: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MOCK_APP_URL) || '/mock-apps';
