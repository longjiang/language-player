import { getRequestConfig } from 'next-intl/server';

/**
 * Admin console is an internal tool, so it always renders English. Messages
 * still come from the shared CSV-driven locale files (source of truth), and
 * all UI strings go through `useT()` like the rest of the project.
 */
export default getRequestConfig(async () => {
  const messages = (
    await import('../../../packages/shared/locales/en.json')
  ).default as Record<string, unknown>;
  return { locale: 'en', messages };
});
