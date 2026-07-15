/**
 * Hook for Chinese script preference (simplified vs traditional).
 * For dictionary entries, swaps head/alternate using existing data — no OpenCC needed.
 */

'use client';

import { useMemo } from 'react';
import { getUseTraditional } from '@/lib/settings';

/**
 * Returns the preferred script form for a Chinese word.
 * If useTraditional is on and the entry has an alternate (traditional) form,
 * returns it as the primary head and the simplified as alternate.
 */
export function useScriptPreference(l2Code: string) {
  const isChinese = l2Code === 'zh' || l2Code.startsWith('zh-');
  const useTraditional = isChinese ? getUseTraditional() : false;

  return useMemo(() => {
    /**
     * Given a head word and optional alternate form, return the correct
     * display pair (head, alternate) based on script preference.
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

    return { apply, useTraditional, isChinese };
  }, [useTraditional, isChinese]);
}
