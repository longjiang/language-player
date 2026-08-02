import type { ReadingSuggestions } from './types';

/**
 * L2 code → Wikipedia language subdomain.
 *
 * Most ISO 639-1 codes map to themselves ({code}.wikipedia.org), so only
 * exceptions need entries. Resolved via wikipediaSubdomain().
 */
const WIKI_SUBDOMAIN_OVERRIDES: Record<string, string> = {
  // All Chinese variants read the zh.wikipedia.org edition.
  zh: 'zh',
  'zh-Hans': 'zh',
  'zh-Hant': 'zh',
  cmn: 'zh',
  // Norwegian Bokmål is served from the no.wikipedia.org edition.
  nb: 'no',
  // Regional Chinese lects use compound Wikimedia subdomains.
  lzh: 'zh-classical',
  nan: 'zh-min-nan',
  yue: 'zh-yue',
};

/**
 * Languages verified to have a live Wikipedia edition (checked against
 * {sub}.wikipedia.org/wiki/Main_Page returning 200). Explicit allowlist so
 * we never suggest a broken URL for a long-tail L2.
 */
const LIVE_WIKIPEDIA_LANGS = new Set([
  'af', 'am', 'ar', 'az', 'be', 'bg', 'bn', 'bo', 'bs', 'ca', 'ceb', 'cs',
  'cy', 'da', 'de', 'el', 'en', 'eo', 'es', 'et', 'eu', 'fa', 'fi', 'fr',
  'ga', 'gl', 'gu', 'ha', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'ig', 'is',
  'it', 'ja', 'ka', 'kk', 'km', 'kn', 'ko', 'ku', 'ky', 'la', 'lo', 'lt',
  'lv', 'mk', 'ml', 'mn', 'mr', 'ms', 'my', 'ne', 'nl', 'no', 'pa', 'pl',
  'pt', 'ro', 'ru', 'si', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'te',
  'th', 'tl', 'tr', 'uk', 'ur', 'uz', 'vi', 'xh', 'yo', 'zh', 'zu',
]);

/** Wikipedia subdomain for an L2 code, or null when no live edition is known. */
export function wikipediaSubdomain(l2Code: string): string | null {
  const override = WIKI_SUBDOMAIN_OVERRIDES[l2Code];
  if (override) return LIVE_WIKIPEDIA_LANGS.has(override) ? override : null;
  const base = l2Code.split('-')[0]!;
  return LIVE_WIKIPEDIA_LANGS.has(base) ? base : null;
}

/**
 * Fallback for languages without curated JSON: the Wikipedia front page.
 * The reader's HTML→markdown pipeline special-cases #mw-content-text, which
 * every MediaWiki page exposes, so main pages still convert cleanly.
 */
export function derivedWikipediaSuggestions(l2Code: string): ReadingSuggestions | null {
  const sub = wikipediaSubdomain(l2Code);
  if (!sub) return null;
  return {
    articles: [{ title: 'Wikipedia', url: `https://${sub}.wikipedia.org` }],
  };
}
