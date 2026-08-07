/**
 * Onboarding language selection screen (ADR-0017).
 *
 * Replaces the two-screen select-l1 → select-l2 flow with a single
 * responsive LanguagePicker. Shows the welcome title and redirects
 * to the main tabs on confirmation.
 */

import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguagePicker } from '@/components/LanguagePicker';
import { e2e } from '@/lib/e2e';

export default function SelectLanguageScreen() {
  const { setL1Lang, setL2Lang } = useLanguage();

  async function handleConfirm(l1: string, l2: string) {
    await setL1Lang(l1);
    await setL2Lang(l2);
    // Land on Explore (media tab) after onboarding, not the bare tabs stack.
    router.replace('/(tabs)/(media)' as any);
  }

  return (
    <View className="flex-1 bg-background" {...e2e('select-language-screen')}>
      <LanguagePicker
        onConfirm={handleConfirm}
        showTitle
        variant="fullscreen"
      />
    </View>
  );
}
