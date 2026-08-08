import React from 'react';
import { View, Text } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useT } from '@/hooks/use-t';

/**
 * Persistent, non-blocking notice for network-dependent features when the
 * user is effectively offline (Offline Mode or no connectivity).
 */
export function OfflineFeatureNotice() {
  const t = useT();
  const { status } = useSyncStatus();
  if (!status.effectiveOffline) return null;

  return (
    <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <WifiOff size={16} color={ICON_MUTED} />
      <Text className="flex-1 text-xs text-muted-foreground">
        {t('msg.feature_requires_connection')}
      </Text>
    </View>
  );
}
