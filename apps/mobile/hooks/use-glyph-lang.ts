import { useLanguage } from '@/contexts/LanguageContext';
import { useScriptPreference } from './use-script-preference';
import { glyphLangTag } from '@langplayer/shared';

/** Resolve the native glyph domain for an L2 content surface. */
export function useGlyphLang(l2Code?: string): string {
  const { l2Lang } = useLanguage();
  const code = l2Code || l2Lang.code;
  const { useTraditional } = useScriptPreference(code);
  return glyphLangTag(code, useTraditional);
}
