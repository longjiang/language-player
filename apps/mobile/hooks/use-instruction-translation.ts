import { useEffect, useState } from 'react';
import { translateTexts } from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';

/**
 * Machine-translate one L2 string into L1, on the spot (SPEC-095).
 *
 * Task instructions are authored in L2 only — there is no `instructionsL1` in the
 * content model — so the translation under them is generated at runtime. That
 * keeps it from drifting when the L2 text is edited, and avoids authoring 17 extra
 * strings per task for a line the student reads once.
 *
 * Returns null while loading, on failure, and when translation is off, so the
 * caller renders nothing in those cases: the L2 instructions are always shown and
 * are the exercise; this is support beneath them.
 */
export function useInstructionTranslation(
  text: string,
  l1Code: string,
  l2Code: string,
  enabled: boolean,
): string | null {
  const [translated, setTranslated] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !text || l1Code === l2Code) {
      setTranslated(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    translateTexts({
      texts: [text],
      l1: l1Code,
      l2: l2Code,
      apiBaseUrl: PYTHON_API_URL,
      signal: controller.signal,
    })
      .then((result) => {
        if (cancelled) return;
        const value = result?.[0];
        // An echo of the source means the backend could not translate it; showing
        // the L2 line twice is worse than showing nothing.
        setTranslated(value && value !== text ? value : null);
      })
      .catch((err) => {
        if (!cancelled) log('[LP Mobile] Textbook: instruction translation failed', err);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [text, l1Code, l2Code, enabled]);

  return translated;
}
