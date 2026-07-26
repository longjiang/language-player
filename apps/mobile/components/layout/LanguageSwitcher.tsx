import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import * as Dialog from '@/components/ui/dialog';
import { LanguagePicker } from '@/components/LanguagePicker';

/** Short code for the pill display (e.g. 'zh-Hans' → 'ZH', 'en' → 'EN'). */
function getLanguageCode(code: string): string {
  return code.split('-')[0]!.toUpperCase();
}

export function LanguageSwitcher() {
  const { l1Lang, l2Lang, setL1Lang, setL2Lang } = useLanguage();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pickerInitialL1, setPickerInitialL1] = useState(l1Lang.code);
  const [pickerInitialL2, setPickerInitialL2] = useState(l2Lang.code);

  async function handleConfirm(l1: string, l2: string) {
    await setL1Lang(l1);
    await setL2Lang(l2);
    setOpen(false);
  }

  function handleOpen() {
    setPickerInitialL1(l1Lang.code);
    setPickerInitialL2(l2Lang.code);
    setOpen(true);
  }

  return (
    <View className="flex-row items-center gap-1">
      {/* L1 pill */}
      <Pressable onPress={handleOpen} className="rounded-full bg-primary/10 px-2.5 py-1">
        <Text className="text-xs font-bold text-primary" numberOfLines={1}>
          {getLanguageCode(l1Lang.code)}
        </Text>
      </Pressable>

      {/* Arrow */}
      <Text className="text-xs text-muted-foreground">→</Text>

      {/* L2 pill */}
      <Pressable onPress={handleOpen} className="rounded-full bg-accent/10 px-2.5 py-1">
        <Text className="text-xs font-bold text-accent" numberOfLines={1}>
          {getLanguageCode(l2Lang.code)}
        </Text>
      </Pressable>

      {/* Single dialog — same LanguagePicker as onboarding */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay closeOnPress />
          <Dialog.SheetContent>
            <LanguagePicker
              initialL1={pickerInitialL1}
              initialL2={pickerInitialL2}
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
