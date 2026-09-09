import React from 'react';
import { View, Text } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Cloud, CloudOff, CloudUpload, CloudAlert } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
import { useT } from '@/hooks/use-t';
import { e2e } from '@/lib/e2e';

/**
 * Global sync status cloud icon (SPEC-053 Phase 2).
 *   synced     → muted cloud
 *   syncing    → cloud upload
 *   offline    → cloud off
 *   error      → cloud alert
 * Pending/error counts render as a small badge; tapping opens Sync Status
 * inside the settings modal (ADR-0042).
 */
export function SyncStatusIcon() {
  const t = useT();
  const { status } = useSyncStatus();
  const { openSettings } = useSettingsDialog();
  const { effectiveOffline, syncing, pendingCount, errorCount } = status;
  const badgeCount = pendingCount + errorCount;

  const Icon = errorCount > 0
    ? CloudAlert
    : effectiveOffline
      ? CloudOff
      : syncing
        ? CloudUpload
        : Cloud;

  const label = effectiveOffline
    ? t('msg.offline_changes_saved')
    : errorCount > 0
      ? t('msg.needs_attention')
      : syncing
        ? t('msg.syncing')
        : t('msg.synced');

  return (
    <Pressable
      onPress={() => openSettings('sync')}
      className="relative rounded-lg p-1 active:bg-muted"
      accessibilityRole="button"
      accessibilityLabel={`${label}${badgeCount > 0 ? ` — ${badgeCount}` : ''}`}
      {...e2e('sync-status-button')}
    >
      <Icon size={20} color={ICON_MUTED} />
      {badgeCount > 0 && (
        <View className="absolute -top-0.5 -right-0.5 h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1">
          <Text className="text-[10px] font-bold text-destructive-foreground">
            {badgeCount > 9 ? '9+' : badgeCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
