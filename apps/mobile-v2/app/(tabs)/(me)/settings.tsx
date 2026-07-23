import React from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';

export default function SettingsScreen() {
  const { display, updateDisplay, loaded } = useSettingsContext();
  const t = useT();

  if (!loaded) return null;

  return (
    <ScrollView className="flex-1 bg-background px-4 py-5">
      <Text className="text-2xl font-bold text-foreground mb-6">{t('title.settings')}</Text>

      {/* DISPLAY */}
      <Text className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Display</Text>
      <View className="mb-6 rounded-xl border border-border bg-card p-4">

        {/* Theme */}
        <View className="mb-4">
          <Text className="mb-2 text-sm font-medium text-foreground">{t('label.theme')}</Text>
          <View className="flex-row rounded-lg border border-border p-1">
            {(['light','dark','system'] as const).map((v) => (
              <Pressable key={v} onPress={() => updateDisplay({ theme: v })}
                className={`flex-1 items-center rounded-md px-3 py-2 ${display.theme === v ? 'bg-muted' : ''}`}>
                <Text className={`text-sm font-medium ${display.theme === v ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {v === 'light' ? '☀️ Light' : v === 'dark' ? '🌙 Dark' : '💻 System'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Translation */}
        <View className="flex-row items-center justify-between py-3">
          <View className="flex-1 pr-4">
            <Text className="text-sm font-medium text-foreground">{t('label.show_translation')}</Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">{t('msg.show_translation_desc')}</Text>
          </View>
          <Switch value={display.translation} onValueChange={(v) => updateDisplay({ translation: v })} />
        </View>

        {/* Popup Dictionary */}
        <View className="flex-row items-center justify-between py-3">
          <View className="flex-1 pr-4">
            <Text className="text-sm font-medium text-foreground">{t('label.enable_popup_dictionary')}</Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">{t('msg.enable_popup_dictionary_desc')}</Text>
          </View>
          <Switch value={display.popupDictionary ?? true} onValueChange={(v) => updateDisplay({ popupDictionary: v })} />
        </View>
      </View>

      {/* PLAYBACK */}
      <Text className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Playback</Text>
      <View className="mb-6 rounded-xl border border-border bg-card p-4">
        <View className="flex-row items-center justify-between py-3">
          <View className="flex-1 pr-4">
            <Text className="text-sm font-medium text-foreground">{t('label.auto_pause')}</Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">{t('msg.auto_pause_desc')}</Text>
          </View>
          <Switch value={display.autoPause ?? false} onValueChange={(v) => updateDisplay({ autoPause: v })} />
        </View>
      </View>

      {/* SRS REVIEW */}
      <Text className="mb-3 text-xs font-semibold uppercase text-muted-foreground">SRS Review</Text>
      <View className="rounded-xl border border-border bg-card p-4">
        <Text className="text-sm text-muted-foreground">{t('msg.review_settings_desc')}</Text>
      </View>
    </ScrollView>
  );
}
