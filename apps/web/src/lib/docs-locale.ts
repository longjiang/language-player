import { SUPPORTED_L1S } from '@langplayer/shared';

const SUPPORTED_L1_SET = new Set<string>(SUPPORTED_L1S);

/** Chinese variants commonly sent by browsers, mapped to our UI locales. */
const ZH_REGION_MAP: Record<string, string> = {
  zh: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-mo': 'zh-Hant',
};

function isSupportedL1(code: string): boolean {
  return SUPPORTED_L1_SET.has(code);
}

/** Pick the best supported L1 from an Accept-Language header. */
export function detectBrowserL1(acceptLanguage: string | null | undefined): string {
  if (!acceptLanguage) return 'en';

  const locales = acceptLanguage
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      const [rawCode = '', qVal] = trimmed.split(';q=');
      return {
        code: rawCode.trim().replace(/_/g, '-'),
        q: qVal ? parseFloat(qVal) : 1,
      };
    })
    .filter((l) => l.code.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { code } of locales) {
    const lower = code.toLowerCase();
    const exact = SUPPORTED_L1S.find((l1) => l1.toLowerCase() === lower);
    if (exact) return exact;

    const primary = code.split('-')[0]!.toLowerCase();
    const zhMapped = ZH_REGION_MAP[lower] ?? ZH_REGION_MAP[primary];
    if (zhMapped) return zhMapped;

    const primaryMatch = SUPPORTED_L1S.find((l1) => l1.toLowerCase() === primary);
    if (primaryMatch) return primaryMatch;
  }

  return 'en';
}

/**
 * Docs are no longer pair-scoped; the optional ?l1= query selects the
 * content language, falling back to the browser's language.
 */
export function resolveDocsL1(
  queryL1: string | undefined,
  acceptLanguage: string | null | undefined,
): string {
  if (queryL1 && isSupportedL1(queryL1)) return queryL1;
  return detectBrowserL1(acceptLanguage);
}
