import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { usePathname } from 'expo-router';
import Toast from 'react-native-toast-message';
import * as Dialog from '@/components/ui/dialog';
import { Button, buttonTextClass } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { log } from '@/lib/logger';

/**
 * Routes where an L2 change is the app restoring a pair rather than the learner
 * switching language: login restores the last-used pair, and onboarding sets the
 * first one. Prompting there would open a dialog over the sign-in flow.
 */
const AUTH_ROUTES = new Set(['/login', '/register', '/verify-email', '/select-language']);

/**
 * Asks the learner to download the offline dictionary the moment they switch to
 * an L2 that does not have one (SPEC-013 Phase 7.4 / SPEC-022).
 *
 * Mounted once at the root, so it covers every way the L2 can change — the
 * header language switcher, the picker, and a deep link carrying `?l2=`. The
 * pickers call `setL2Lang` directly, so watching `l2Lang.code` is the only place
 * that sees all of them.
 *
 * Two effects on purpose. Noticing the switch and deciding about it are
 * separate, because every switch from the header is followed immediately by
 * `router.replace('/(tabs)/(media)')`: a single effect keyed on the pathname
 * would have its in-flight availability check cancelled by that navigation and
 * silently drop the prompt.
 *
 * Deliberately silent when:
 *   - it is the app's first observation of an L2 (a cold start is not a switch),
 *   - the route is an auth/onboarding screen (see AUTH_ROUTES),
 *   - a download for that L2 is already running,
 *   - the device is offline — the download would be blocked by the network gate,
 *     which is the same reason `OfflineBanner` hides itself while offline. The
 *     pending switch is remembered, so the question is asked once a connection
 *     is back rather than being dropped.
 */
export function OfflineDictionaryPrompt() {
  const t = useT();
  const pathname = usePathname();
  const { l2Lang } = useLanguage();
  const { isOfflineAvailable, startDownload, getDownloadState } = useDictionaryContext();
  const { status } = useSyncStatus();
  const [open, setOpen] = useState(false);
  /** An L2 the learner switched to whose offline dictionary is undecided. */
  const [pendingL2, setPendingL2] = useState<string | null>(null);
  const previousL2 = useRef<string | null>(null);

  // 1. Notice a language switch.
  useEffect(() => {
    const code = l2Lang.code;
    const previous = previousL2.current;
    previousL2.current = code;
    // Cold start: adopt the stored L2 without asking.
    if (previous === null || previous === code) return;
    if (pathname && AUTH_ROUTES.has(pathname)) {
      log(`[Dict] offline dictionary prompt skipped — ${pathname} sets the pair, it is not a switch`);
      return;
    }
    log(`[Dict] L2 switched ${previous} → ${code}; checking for an offline dictionary`);
    setPendingL2(code);
  }, [l2Lang.code, pathname]);

  // 2. Decide it, once we know whether the device is online. The sync status
  //    starts out as "effectiveOffline", so an early or genuinely offline switch
  //    waits here instead of being discarded.
  useEffect(() => {
    if (pendingL2 == null) return;
    if (pendingL2 !== l2Lang.code) {
      // Switched again before this one was decided — only the latest matters.
      setPendingL2(null);
      return;
    }
    if (status.effectiveOffline) {
      log(`[Dict] offline dictionary check for ${pendingL2} is waiting for a connection`);
      return;
    }
    let cancelled = false;
    void (async () => {
      let available = true;
      try {
        available = await isOfflineAvailable(pendingL2);
      } catch (e) {
        log('[Dict] offline dictionary availability check failed:', (e as Error)?.message ?? e);
        if (!cancelled) setPendingL2(null);
        return;
      }
      if (cancelled) return;
      const download = getDownloadState(pendingL2);
      log(`[Dict] offline dictionary for ${pendingL2}: available=${available} download=${download.status}`);
      setPendingL2(null);
      if (!available && download.status !== 'downloading') setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingL2, l2Lang.code, status.effectiveOffline, isOfflineAvailable, getDownloadState]);

  const handleDownload = useCallback(() => {
    setOpen(false);
    log(`[Dict] offline dictionary download requested for ${l2Lang.code} from the L2-switch prompt`);
    Toast.show({
      type: 'success',
      text1: t('title.offline_dictionaries'),
      text2: t('log.downloading'),
    });
    // Long-running: progress is reported by the download state and the Offline
    // Dictionaries screen, so the dialog does not wait for it.
    void startDownload(l2Lang.code).catch((e) => {
      log('[Dict] offline dictionary download failed to start:', (e as Error)?.message ?? e);
    });
  }, [l2Lang.code, startDownload, t]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Content>
          <Dialog.Title className="text-base font-bold text-foreground">
            {t('title.offline_dictionaries')}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {t('msg.download_offline_dict_prompt', { language: t('lang.' + l2Lang.code) })}
          </Dialog.Description>

          <View className="mt-4 flex-col gap-2">
            <Dialog.Close className="w-full items-center rounded-lg px-4 py-2.5">
              <Text className="text-sm text-muted-foreground">{t('action.cancel')}</Text>
            </Dialog.Close>
            <Button onPress={handleDownload} accessibilityLabel={t('action.download')} className="w-full">
              <Text className={buttonTextClass('default')}>{t('action.download')}</Text>
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
