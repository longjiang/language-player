'use client';

import { useLanguage } from '@/providers/language-provider';
import { useScriptPreference } from './use-script-preference';
import { glyphLangTag } from '@/lib/language-data';

/**
 * Preference-resolved BCP47 `lang` tag for an L2 content container (SPEC-080).
 *
 * Returns the glyph-safe tag for the L2 language, honoring the user's
 * simplified-vs-traditional preference for script-less Han codes. Use this
 * together with `isRTL(code)` (or `l2.direction`) to set `dir` on the same
 * container (SPEC-080 Rule 8).
 */
export function useGlyphLang(l2Code?: string): string {
  const { l2 } = useLanguage();
  const code = l2Code ?? l2.code;
  const { useTraditional } = useScriptPreference(code);
  return glyphLangTag(code, useTraditional);
}
