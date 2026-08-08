import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { RefreshCw, CloudOff, CloudUpload, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import {
  getOutboxSnapshot,
  retryFailedOps,
  type OutboxSnapshot,
} from '@/lib/sync-engine';
import { useT } from '@/hooks/use-t';
import { e2e } from '@/lib/e2e';
import { SyncNowButton } from '@/components/sync/SyncNowButton';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { ICON_PRIMARY } from '@/lib/theme-colors';

/** Central Sync Status / Outbox screen (SPEC-053 Phase 2). */
export default function SyncStatusScreen() {
  const t = useT();
  const { status } = useSyncStatus();
  const { offlineMode, setOfflineMode } = useSettingsContext();
  const [ops, setOps] = useState<OutboxSnapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getOutboxSnapshot().then((rows) => {
      if (!cancelled) setOps(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [status.pendingCount, status.errorCount, status.lastSyncAt]);

  const { effectiveOffline, syncing, pendingCount, errorCount, lastSyncAt, lastError } = status;
  const stateText = effectiveOffline
    ? t('msg.offline_changes_saved')
    : syncing
      ? t('msg.syncing')
      : errorCount > 0
        ? t('msg.needs_attention')
        : pendingCount > 0
          ? t('msg.pending_changes', { count: String(pendingCount) })
          : t('msg.synced');

  return (
    <ScrollView className="flex-1 bg-background px-4 py-6" {...e2e('sync-status-screen')}>
      <Text className="text-3xl font-bold text-foreground">{t('title.sync_status')}</Text>

      {/* Offline Mode toggle — same local-only setting as Settings → Network */}
      <View className="mt-4 flex-row items-center justify-between rounded-xl border border-border bg-card p-4">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-semibold text-foreground">{t('title.offline_mode')}</Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">{t('setting.offline_mode_desc')}</Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">{t('msg.offline_mode_not_synced')}</Text>
        </View>
        <Switch
          value={offlineMode}
          onValueChange={(value) => void setOfflineMode(value)}
          trackColor={{ true: ICON_PRIMARY, false: ICON_MUTED }}
        />
      </View>

      <View className="mt-4 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
        {effectiveOffline ? (
          <CloudOff size={24} color={ICON_MUTED} />
        ) : syncing ? (
          <CloudUpload size={24} color={ICON_MUTED} />
        ) : errorCount > 0 ? (
          <AlertTriangle size={24} color={ICON_MUTED} />
        ) : (
          <CheckCircle2 size={24} color={ICON_MUTED} />
        )}
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground">{stateText}</Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {lastSyncAt ? t('msg.last_sync_at', { time: new Date(lastSyncAt).toLocaleTimeString() }) : null}
          </Text>
          {lastError ? (
            <Text className="mt-1 text-xs text-destructive">{lastError}</Text>
          ) : null}
        </View>
        <SyncNowButton />
      </View>

      {errorCount > 0 && (
        <Pressable
          onPress={() => void retryFailedOps()}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-lg border border-border bg-card py-2.5"
          accessibilityRole="button"
        >
          <RefreshCw size={16} color={ICON_MUTED} />
          <Text className="text-sm font-medium text-foreground">{t('action.retry')}</Text>
        </Pressable>
      )}

      <Text className="mt-6 mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {t('msg.pending_changes', { count: String(ops.length) })}
      </Text>

      {ops.length === 0 ? (
        <Text className="text-sm text-muted-foreground">{t('msg.no_pending_changes')}</Text>
      ) : (
        ops.map((op) => (
          <View
            key={op.id}
            className="mb-2 rounded-lg border border-border bg-card p-3"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-medium text-foreground">
                {op.op === 'delete' ? '✕' : '＋'} {op.entity}
              </Text>
              <Text
                className={`text-xs font-semibold ${
                  op.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {op.status === 'error' ? t('msg.needs_attention') : t('msg.saved_locally')}
              </Text>
            </View>
            <Text className="mt-0.5 text-xs text-muted-foreground font-mono">
              {op.entity_id}
            </Text>
            {op.last_error ? (
              <Text className="mt-1 text-xs text-destructive">{op.last_error}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}
