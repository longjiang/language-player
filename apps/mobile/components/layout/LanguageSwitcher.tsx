import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { router, useSegments } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useResponsive } from '@/hooks/use-responsive';
import * as Dialog from '@/components/ui/dialog';
import { LanguagePicker } from '@/components/LanguagePicker';
import { ICON_MUTED } from '@/lib/theme-colors';

/** True when the user is already on the Explore tab (media index). */
function isExplore(segments: string[]): boolean {
  return segments.includes('(media)') && !segments.some((s) => !s.startsWith('(') && !s.endsWith(')'));
}

export function LanguageSwitcher() {
  const { l1Lang, l2Lang, setL1Lang, setL2Lang } = useLanguage();
  const segments = useSegments();
  const { isMd } = useResponsive();
  const [open, setOpen] = useState(false);
  const [pickerInitialL1, setPickerInitialL1] = useState(l1Lang.code);
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(spinAnim, {
      toValue: open ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [open, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  async function handleConfirm(l1: string, l2: string) {
    const l2Changed = l2 !== l2Lang.code;
    await setL1Lang(l1);
    await setL2Lang(l2);
    setOpen(false);
    // Changing L2 invalidates the current page's content, so always return
    // to Explore. An L1-only change keeps the user on the same page.
    if (l2Changed && !isExplore(segments)) {
      router.replace('/(tabs)/(media)' as any);
    }
  }

  function handleOpen() {
    setPickerInitialL1(l1Lang.code);
    setOpen(true);
  }

  return (
    <View>
      {/* Plain language name + chevron */}
      <Pressable onPress={handleOpen} className="flex-row items-center gap-1 px-2.5 py-1">
        <Text className="text-sm text-foreground" numberOfLines={1}>
          {l2Lang.name}
        </Text>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <ChevronDown size={12} color={ICON_MUTED} />
        </Animated.View>
      </Pressable>

      {/* Single dialog — same LanguagePicker as onboarding */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          {isMd ? (
            /* Web parity: centered dialog on wide screens (apps/web uses DialogContent). */
            <Dialog.Content>
              <LanguagePicker
                initialL1={pickerInitialL1}
                initialL2={l2Lang.code}
                onConfirm={handleConfirm}
                onDismiss={() => setOpen(false)}
                showClose
                variant="dialog"
              />
            </Dialog.Content>
          ) : (
            /* Phone/split-view: bottom sheet. */
            <Dialog.SheetContent>
              <LanguagePicker
                initialL1={pickerInitialL1}
                initialL2={l2Lang.code}
                onConfirm={handleConfirm}
                onDismiss={() => setOpen(false)}
                showClose
                variant="dialog"
              />
            </Dialog.SheetContent>
          )}
        </Dialog.Portal>
      </Dialog.Root>
    </View>
  );
}
