/**
 * Hook for script preference — determines which alternate script form to display
 * next to the headword for Chinese, Vietnamese, and Korean dictionary entries.
 *
 * Chinese (zh, yue, lzh): shows the opposite script based on the user's
 *   traditional/simplified preference setting.
 * Vietnamese (vi) / Korean (ko): shows chữ Hán / hanja from han_script.han.
 * All other languages: no alternate script.
 */

'use client';

import { useMemo } from 'react';
import { getUseTraditional } from '@/lib/settings';

/** ISO 639-1 codes for languages that use Chinese characters and have a
 *  traditional/simplified script toggle. */
const CHINESE_LANGS = new Set(['zh', 'yue', 'lzh']);

function isChineseLang(l2Code: string): boolean {
  return CHINESE_LANGS.has(l2Code) || l2Code.startsWith('zh-');
}

/** Languages that display han_script.han as the alternate script form. */
const HAN_SCRIPT_LANGS = new Set(['vi', 'ko']);

/**
 * Returns script preference helpers for the given L2 language.
 */
export function useScriptPreference(l2Code: string) {
  const isChinese = isChineseLang(l2Code);
  const isHanScript = HAN_SCRIPT_LANGS.has(l2Code);
  const useTraditional = isChinese ? getUseTraditional() : false;

  return useMemo(() => {
    /**
     * Given a head word and optional alternate form, return the correct
     * display pair (head, alternate) based on script preference.
     *
     * For Chinese with useTraditional=true: swaps head ↔ alternate so
     * the traditional form is displayed as the primary head.
     */
    function apply(head: string, alternate?: string | null): {
      head: string;
      alternate: string | null;
    } {
      if (!useTraditional || !alternate || alternate === head) {
        return { head, alternate: alternate && alternate !== head ? alternate : null };
      }
      // Swap: traditional becomes the head, simplified becomes the alternate
      return { head: alternate, alternate: head };
    }

    /**
     * Determine which alternate script form to display next to the headword.
     *
     * Rules:
     * - Chinese (zh, yue, lzh): the opposite script based on traditional/simplified
     *   preference. After apply() has run, entry.alternate holds the non-preferred form.
     * - Vietnamese (vi) / Korean (ko): chữ Hán / hanja from han_script.han.
     * - All other languages: null (hide alternate).
     */
    function getAlternateScript(entry: {
      head: string;
      alternate?: string | null;
      han_script?: { traditional?: string; simplified?: string; han?: string } | null;
    }): string | null {
      // Vietnamese / Korean: show han script (chữ Hán / hanja)
      if (isHanScript && entry.han_script?.han) {
        return entry.han_script.han;
      }
      // Chinese: alternate is already set correctly by apply()
      if (isChinese && entry.alternate && entry.alternate !== entry.head) {
        return entry.alternate;
      }
      return null;
    }

    return { apply, getAlternateScript, useTraditional, isChinese, isHanScript };
  }, [useTraditional, isChinese, isHanScript]);
}
