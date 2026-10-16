import { useEffect, useState } from 'react';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { logwarn } from '@/lib/logger';

/**
 * Whether an offline dictionary is downloaded for an L2.
 * Returns `null` while the first check is in flight, `true`/`false` after.
 * Re-checks whenever the dictionary download state changes.
 */
export function useOfflineDictionaryAvailable(l2Code: string): boolean | null {
  const { isOfflineAvailable, downloadStatesVersion } = useDictionaryContext();
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAvailable(null);
    void isOfflineAvailable(l2Code)
      .then((value) => {
        if (!cancelled) setAvailable(value);
      })
      .catch((err) => {
        // A failed check must settle: leaving `available` at null would keep the
        // "offline and no dictionary downloaded" notice disabled forever.
        logwarn(`offline-dictionary availability check failed for ${l2Code}: ${(err as Error)?.message ?? err}`);
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [l2Code, isOfflineAvailable, downloadStatesVersion]);

  return available;
}
