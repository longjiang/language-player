/**
 * Resolve a language to the BCP 47 script tag that should control glyph
 * selection.  Han code points are shared by Japanese and Chinese, so a bare
 * language code is not specific enough for font fallback.
 */

const HAN_CODES = new Set([
  'zh', 'yue', 'lzh', 'nan', 'hak', 'wuu', 'hsn', 'cjy', 'cpx', 'czh',
  'cdo', 'cng', 'gan', 'mnp',
]);

function primaryCode(code: string): string {
  return code.split('-')[0]?.toLowerCase() ?? code.toLowerCase();
}

/**
 * Return a glyph-safe BCP 47 tag for text written in `code`.
 *
 * Explicit script subtags are authoritative.  Script-less Han varieties use
 * the app's simplified/traditional preference, while Japanese and Korean
 * remain in their own glyph domains.
 */
export function glyphLangTag(code: string, useTraditional: boolean): string {
  const normalized = code.toLowerCase();
  const primary = primaryCode(code);

  if (primary === 'ja') return 'ja';
  if (primary === 'ko') return 'ko';
  if (normalized.includes('-hans')) return 'zh-Hans';
  if (normalized.includes('-hant')) return 'zh-Hant';
  if (HAN_CODES.has(primary) || primary === 'zh') {
    return useTraditional ? 'zh-Hant' : 'zh-Hans';
  }
  return code;
}

/** True for language codes whose written form uses the Han script domain. */
export function isHanLanguage(code: string): boolean {
  return HAN_CODES.has(primaryCode(code));
}

export type GlyphScript = 'ja' | 'ko' | 'zh-Hans' | 'zh-Hant' | 'other';

/** Return the regional script domain used by a resolved glyph tag. */
export function glyphScript(langTag: string): GlyphScript {
  const normalized = langTag.toLowerCase();
  if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja';
  if (normalized === 'ko' || normalized.startsWith('ko-')) return 'ko';
  if (normalized.includes('-hant')) return 'zh-Hant';
  if (normalized.includes('-hans')) return 'zh-Hans';
  return 'other';
}
