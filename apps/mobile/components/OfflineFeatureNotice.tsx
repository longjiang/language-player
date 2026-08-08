import React from 'react';
import { View, Text } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useT } from '@/hooks/use-t';
import { useOfflineDictionaryAvailable } from '@/hooks/use-offline-dictionary';

/**
 * Persistent, non-blocking notice for network-dependent features when the
 * user is effectively offline (Offline Mode or no connectivity).
 */
interface OfflineFeatureNoticeProps {
  /** Feature needs a downloaded offline dictionary while offline. */
  requiresDictionary?: boolean;
  l2Code?: string;
}

export function OfflineFeatureNotice({
  requiresDictionary = false,
  l2Code,
}: OfflineFeatureNoticeProps) {
  const t = useT();
  const { status } = useSyncStatus();
  const dictAvailable = useOfflineDictionaryAvailable(l2Code ?? '');
  if (!status.effectiveOffline) return null;
  if (requiresDictionary) {
    // While the check is in flight, don't flash anything.
    if (dictAvailable === null) return null;
    // Dictionary downloaded → the feature works offline; no notice needed.
    if (dictAvailable === true) return null;
  }
  const messageKey = requiresDictionary
    ? 'msg.offline_dictionary_required'
    : 'msg.feature_requires_connection';

  return (
    <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <WifiOff size={16} color={ICON_MUTED} />
      <Text className="flex-1 text-xs text-muted-foreground">
        {t(messageKey)}
      </Text>
    </View>
  );
}
