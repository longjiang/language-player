import { useEffect, useState } from 'react';
import { translateTexts } from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';

/**
 * Machine-translate a recording's transcript into L1, line by line (SPEC-095).
 *
 * A transcript is authored in L2 only — there is no `transcriptL1` in the content model —
 * so the translation under each line is generated when the student opens it, exactly as
 * the instructions' translation is. This mirrors `useInstructionTranslation`; the
 * difference is that a transcript is many lines, so all of them go in one request.
 *
 * Returns null while loading, on failure, and when translation is off, so the caller
 * renders the L2 transcript alone in those cases. An empty string in the result means
 * "this line has no translation" (the backend echoed it), rendered as nothing rather than
 * as the L2 line twice.
 */
export function useTranscriptTranslation(
  lines: string[],
  l1Code: string,
  l2Code: string,
  enabled: boolean,
): string[] | null {
  const [translated, setTranslated] = useState<string[] | null>(null);
  // The array identity changes on every render; its text is what the request depends on.
  const signature = lines.join('\n');

  useEffect(() => {
    if (!enabled || lines.length === 0 || l1Code === l2Code) {
      setTranslated(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    translateTexts({
      texts: lines,
      l1: l1Code,
      l2: l2Code,
      apiBaseUrl: PYTHON_API_URL,
      signal: controller.signal,
    })
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setTranslated(null);
          return;
        }
        setTranslated(result.map((value, i) => (value && value !== lines[i] ? value : '')));
      })
      .catch((err) => {
        if (!cancelled) log('[LP Mobile] Textbook: transcript translation failed', err);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, l1Code, l2Code, enabled]);

  return translated;
}
