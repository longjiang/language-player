/**
 * Base URL the mock app HTML is served from (SPEC-095, ADR-0045).
 *
 * Mock apps are code, not media, so they are not on the asset host. They live in
 * the web app's `public/mock-apps/` and are served same-origin there; a WebView
 * has no same-origin relationship with them either way, so mobile loads them from
 * the web origin and speaks to them purely over the bridge.
 *
 * Set EXPO_PUBLIC_MOCK_APP_URL to point at a local web dev server while working
 * on a mock app.
 */
const PRODUCTION_URL = 'https://languageplayer.io/mock-apps';
const DEV_URL = 'http://localhost:3000/mock-apps';

export const MOCK_APP_BASE_URL: string =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_MOCK_APP_URL) ||
  (__DEV__ ? DEV_URL : PRODUCTION_URL);
