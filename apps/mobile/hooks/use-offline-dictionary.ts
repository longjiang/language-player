import { useEffect, useState } from 'react';
import { useDictionaryContext } from '@/contexts/DictionaryContext';

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
    void isOfflineAvailable(l2Code).then((value) => {
      if (!cancelled) setAvailable(value);
    });
    return () => {
      cancelled = true;
    };
  }, [l2Code, isOfflineAvailable, downloadStatesVersion]);

  return available;
}
