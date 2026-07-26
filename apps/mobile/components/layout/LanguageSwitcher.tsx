import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import * as Dialog from '@/components/ui/dialog';
import { LanguagePicker } from '@/components/LanguagePicker';
import { ICON_MUTED } from '@/lib/theme-colors';

export function LanguageSwitcher() {
  const { l2Lang, setL1Lang, setL2Lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pickerInitialL1, setPickerInitialL1] = useState(l2Lang.code);

  async function handleConfirm(l1: string, l2: string) {
    await setL1Lang(l1);
    await setL2Lang(l2);
    setOpen(false);
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
        <ChevronDown size={12} color={ICON_MUTED} />
      </Pressable>

      {/* Single dialog — same LanguagePicker as onboarding */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay closeOnPress />
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
