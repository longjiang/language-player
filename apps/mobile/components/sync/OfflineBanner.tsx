import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useT } from '@/hooks/use-t';
import { e2e } from '@/lib/e2e';

/**
 * Persistent, non-blocking offline/pending banner (SPEC-053 Phase 2).
 * Shown while the device is effectively offline or when the outbox has
 * pending/error operations. "Sync now" is a no-op while offline (the engine
 * skips network calls), which is intentional.
 */
export function OfflineBanner({ topInset = 0 }: { topInset?: number }) {
  const t = useT();
  const { status, syncNow } = useSyncStatus();
  const { effectiveOffline, pendingCount, errorCount } = status;
  const total = pendingCount + errorCount;
  if (!effectiveOffline && total === 0) return null;

  return (
    <View
      className="flex-row items-center justify-between border-b border-border bg-muted px-4"
      style={{ paddingTop: 8 + topInset, paddingBottom: 8 }}
      {...e2e('offline-banner')}
    >
      <Text className="flex-1 pr-3 text-xs font-medium text-foreground">
        {effectiveOffline
          ? `${t('msg.offline_changes_saved')}${total > 0 ? ` · ${t('msg.pending_changes', { count: String(total) })}` : ''}`
          : t('msg.pending_changes', { count: String(total) })}
      </Text>
      {total > 0 && (
        <Pressable
          onPress={() => void syncNow()}
          className="rounded-md bg-primary px-2.5 py-1"
          accessibilityRole="button"
        >
          <Text className="text-xs font-semibold text-primary-foreground">
            {t('action.sync_now')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
