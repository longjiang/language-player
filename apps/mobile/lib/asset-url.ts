/**
 * Base URL for textbook media (SPEC-095, ADR-0043).
 *
 * Textbook audio and images are ~29 MB per unit, so they are not committed and
 * not bundled into the app binary — they are published to the shared host and
 * addressed through this single constant. Content files store relative asset
 * keys, so changing host is a change to this value plus a re-upload.
 *
 * Set EXPO_PUBLIC_ASSET_URL to point at the published location:
 *   - Production (default): the shared host.
 *   - Dev: the local Flask/web origin, so `npm run dev` works with locally
 *     extracted media.
 *
 * Mirrors `api-url.ts` on both platforms: import this rather than reading
 * `process.env` at a call site.
 */

const PRODUCTION_URL = 'https://server.chinesezerotohero.com/data/textbook';

/** The base URL textbook media is resolved against. */
export const ASSET_BASE_URL: string =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ASSET_URL) || PRODUCTION_URL;
