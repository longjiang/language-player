import { getRequestConfig } from 'next-intl/server';

/**
 * Admin console is an internal tool, so it always renders English. Messages
 * still come from the shared CSV-driven locale files (source of truth), and
 * all UI strings go through `useT()` like the rest of the project.
 *
 * NOTE: the locale JSON lives outside this app (`packages/shared/locales/`),
 * so Turbopack does not reliably re-read it when it changes. After running
 * `scripts/sync-translations.mjs csv-to-json`, restart `next dev` — otherwise
 * newly added keys resolve to MISSING_MESSAGE (and a key whose text changed
 * keeps its old value) until the server is restarted.
 */
export default getRequestConfig(async () => {
  const messages = (
    await import('../../../packages/shared/locales/en.json')
  ).default as Record<string, unknown>;
  return { locale: 'en', messages };
});
