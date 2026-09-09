import React, { useEffect, useRef, useState } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import * as Dialog from '@/components/ui/dialog';
import { Pressable } from '@/components/ui/pressable';
import { ICON_MUTED } from '@/lib/theme-colors';
import { MD_BREAKPOINT } from '@/lib/constants';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { settingsLogger } from '@/lib/logger';
import { SettingsList } from '@/components/settings/SettingsList';
import { SettingsDetail } from '@/components/settings/SettingsDetail';
import {
  SETTINGS_TITLE_KEYS,
  type SettingsCategory,
} from '@/components/settings/settings-categories';

/**
 * Settings as a modal (ADR-0042).
 *
 * - narrow (< 768): bottom sheet, like the popup dictionary — list first, then
 *   the category's detail with a back control.
 * - wide (>= 768): large centered dialog, like the subs-search playback modal —
 *   category list + search as a left sidebar, detail on the right.
 *
 * The route screens (`/settings/<category>`) render this same dialog, so a deep
 * link opens it on that category; the list/detail switch never navigates.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  initialCategory = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCategory?: SettingsCategory | null;
}) {
  const t = useT();
  const { width } = useWindowDimensions();
  const isMd = width >= MD_BREAKPOINT;
  const { settings, offlineMode } = useSettingsContext();
  const [selected, setSelected] = useState<SettingsCategory | null>(initialCategory);

  // Every open starts from a known pane: the deep-linked category, else
  // Display on wide (sidebar visible, web parity) or the list on narrow.
  useEffect(() => {
    if (!open) return;
    setSelected(initialCategory ?? (isMd ? 'display' : null));
    settingsLogger.log(`settings dialog opened category=${initialCategory ?? (isMd ? 'display' : 'list')} wide=${isMd}`);
  }, [open, initialCategory, isMd]);

  // "Settings saved" confirmation, debounced so a slider drag shows one pill.
  const [savedVisible, setSavedVisible] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSavedVisible(true);
      setTimeout(() => setSavedVisible(false), 2000);
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [settings, offlineMode]);

  const selectCategory = (key: SettingsCategory) => {
    setSelected(key);
    settingsLogger.log(`settings dialog category=${key}`);
  };

  const pane = isMd ? (
    <View className="flex-1 flex-row">
      <View style={{ width: 280 }} className="border-r border-border">
        <SettingsList selectedKey={selected} onSelect={selectCategory} />
      </View>
      <View className="flex-1">
        <SettingsDetail category={selected} />
      </View>
    </View>
  ) : selected ? (
    <View className="flex-1">
      <View className="flex-row items-center gap-1 border-b border-border pb-2">
        <Pressable
          onPress={() => setSelected(null)}
          accessibilityRole="button"
          accessibilityLabel={t('action.back')}
          className="p-2"
        >
          <ArrowLeft size={20} color={ICON_MUTED} />
        </Pressable>
        <Text className="text-base font-semibold text-foreground">
          {t(SETTINGS_TITLE_KEYS[selected])}
        </Text>
      </View>
      <View className="flex-1">
        <SettingsDetail category={selected} />
      </View>
    </View>
  ) : (
    <SettingsList selectedKey={null} onSelect={selectCategory} />
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {isMd ? (
          <Dialog.Content className="h-[85%] w-full max-w-5xl gap-0 overflow-hidden rounded-xl border border-border bg-background p-0">
            <Dialog.Title className="sr-only">{t('title.settings')}</Dialog.Title>
            {pane}
          </Dialog.Content>
        ) : (
          <Dialog.SheetContent className="h-[85%]">
            <Dialog.Title className="sr-only">{t('title.settings')}</Dialog.Title>
            {pane}
          </Dialog.SheetContent>
        )}
      </Dialog.Portal>
      {savedVisible && (
        <View className="absolute top-4 right-4 z-50 rounded-full bg-primary/90 px-3 py-1.5">
          <Text className="text-xs font-medium text-primary-foreground">
            ✓ {t('msg.settings_saved')}
          </Text>
        </View>
      )}
    </Dialog.Root>
  );
}
