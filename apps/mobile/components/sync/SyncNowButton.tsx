import React, { useEffect, useRef, useState } from 'react';
import { Text, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useT } from '@/hooks/use-t';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';

/**
 * "Sync now" button with immediate feedback (SPEC-053 Phase 2):
 *  - online   → shows a spinner + "Syncing…" while a cycle runs
 *  - offline  → shows "Waiting for connection…" briefly after a tap (the
 *               engine syncs automatically once connectivity returns)
 */
export function SyncNowButton() {
  const t = useT();
  const { status, syncNow } = useSyncStatus();
  const { effectiveOffline, syncing } = status;
  const [waiting, setWaiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePress = () => {
    if (syncing || waiting) return;
    if (effectiveOffline) {
      setWaiting(true);
      timerRef.current = setTimeout(() => setWaiting(false), 2500);
      return;
    }
    void syncNow();
  };

  const label = syncing
    ? t('msg.syncing')
    : waiting
      ? t('msg.sync_waiting_connection')
      : t('action.sync_now');

  return (
    <Pressable
      onPress={handlePress}
      disabled={syncing}
      className="min-w-[86px] flex-row items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {syncing && <ActivityIndicator size="small" color={ICON_ON_PRIMARY} />}
      <Text className="text-xs font-semibold text-primary-foreground">{label}</Text>
    </Pressable>
  );
}
