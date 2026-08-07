import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { router, useSegments } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import * as Dialog from '@/components/ui/dialog';
import { LanguagePicker } from '@/components/LanguagePicker';
import { ICON_MUTED } from '@/lib/theme-colors';

/**
 * Dictionary search and dictionary entry pages are content-scoped: after
 * switching L1/L2 the old results/entry no longer apply, so redirect to
 * Explore (matches web's pickRedirectTarget behavior for content pages).
 */
function isDictionaryRoute(segments: string[]): boolean {
  if (!segments.includes('(vocab)')) return false;
  const page = segments.find((s) => !s.startsWith('(') && !s.endsWith(')'));
  return page === undefined || page === 'word';
}

export function LanguageSwitcher() {
  const { l2Lang, setL1Lang, setL2Lang } = useLanguage();
  const segments = useSegments();
  const [open, setOpen] = useState(false);
  const [pickerInitialL1, setPickerInitialL1] = useState(l2Lang.code);
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
    await setL1Lang(l1);
    await setL2Lang(l2);
    setOpen(false);
    if (isDictionaryRoute(segments)) {
      router.replace('/(tabs)/(media)' as any);
    }
  }

  function handleOpen() {
    setPickerInitialL1(l2Lang.code);
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
          <Dialog.SheetContent>
            <LanguagePicker
              initialL1={pickerInitialL1}
              onConfirm={handleConfirm}
              onDismiss={() => setOpen(false)}
              showClose
              variant="dialog"
            />
          </Dialog.SheetContent>
        </Dialog.Portal>
      </Dialog.Root>
    </View>
  );
}
