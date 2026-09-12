/**
 * Base URL for textbook media (SPEC-095, ADR-0043).
 *
 * Textbook audio and images are ~29 MB per unit, so they are not committed and
 * not bundled — they are published to the shared host and addressed through
 * this single constant. Content files store relative asset keys, so moving to a
 * different host later is a change to this value plus a re-upload, with no
 * content edits and no client changes.
 *
 * Set NEXT_PUBLIC_ASSET_URL to point at the published location:
 *   - Local dev (default): `/textbook-assets` — served from `apps/web/public/`
 *     (gitignored), so `npm run dev` works with locally extracted media.
 *   - Production: the shared host, e.g. `https://server.chinesezerotohero.com/data/textbook`
 *
 * Mirrors `api-url.ts`: the shared module is the single source of truth, and
 * callers must import this rather than reading `process.env` directly.
 */

const LOCAL_DEFAULT = '/textbook-assets';

/** The base URL textbook media is resolved against. */
export const ASSET_BASE_URL: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ASSET_URL) || LOCAL_DEFAULT;

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
