import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Download, X } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import * as SecureStore from 'expo-secure-store';

const DISMISSED_KEY = 'offlineBannerDismissed';

/**
 * Banner shown in the Dictionary Hub when no offline dictionary is
 * downloaded for the current L2. Dismissible — stored in AsyncStorage
 * so it stays hidden for this L2 until the user downloads a dict.
 */
export function OfflineBanner() {
  const t = useT();
  const router = useRouter();
  const { l2Lang } = useLanguage();
  const { isOfflineAvailable } = useDictionaryContext();
  const { status } = useSyncStatus();

  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const dismissed = await SecureStore.getItemAsync(DISMISSED_KEY);
        if (dismissed === l2Lang.code) return;
      } catch {}
      try {
        const available = await isOfflineAvailable(l2Lang.code);
        if (!available) setShow(true);
      } catch {}
    })();
  }, [l2Lang.code]);

  if (!show) return null;
  // No point offering a download while offline — the download itself would be
  // blocked by the network gate. The banner comes back when back online.
  if (status.effectiveOffline) return null;

  const handleDismiss = async () => {
    setShow(false);
    try { await SecureStore.setItemAsync(DISMISSED_KEY, l2Lang.code); } catch {}
  };

  return (
    <View className="mx-4 mt-3 rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-start gap-2">
        <Download size={16} color={ICON_PRIMARY} style={{ marginTop: 1 }} />
        <View className="flex-1">
          <Text className="text-sm font-medium text-foreground">
            {t('title.offline_dictionaries')}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {t('msg.offline_dictionaries_desc')}
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/(me)/offline-dictionaries' as any)}
            className="mt-2 self-start rounded-md bg-primary/10 px-3 py-1"
          >
            <Text className="text-xs font-medium text-primary">{t('action.download')}</Text>
          </Pressable>
        </View>
        <Pressable onPress={handleDismiss} className="p-1">
          <X size={14} color={ICON_MUTED} />
        </Pressable>
      </View>
    </View>
  );
}
