import React from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import { cssInterop } from 'nativewind';
import { glyphLangTag } from '@langplayer/shared';
import { useOptionalLanguage } from '@/contexts/LanguageContext';
import { glyphFontFamily } from '@/lib/glyph-font';

export interface GlyphTextProps extends TextProps {
  /** Resolved BCP47 content language. Consumed here instead of forwarded to RN. */
  lang?: string;
  className?: string;
}

/**
 * App-wide Text replacement installed by the Babel transform in babel.config.js.
 * UI strings use L1; callers can pass `lang` for L2 content. The final font
 * style is applied after NativeWind styles so an Inter class cannot force the
 * OS to select a Japanese Han fallback for Chinese text.
 */
export function GlyphText({ lang, style, className: _className, ...props }: GlyphTextProps) {
  const language = useOptionalLanguage();
  const l1Code = language?.l1Lang.code ?? 'en';
  const resolvedLang = lang ?? glyphLangTag(l1Code, false);
  const fontFamily = glyphFontFamily(resolvedLang);

  return (
    <NativeText
      {...props}
      accessibilityLanguage={resolvedLang}
      style={[style, fontFamily ? { fontFamily } : undefined]}
    />
  );
}

cssInterop(GlyphText, { className: 'style' });
