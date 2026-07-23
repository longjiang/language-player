import React, { useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';

export default function SettingsScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, set, loaded } = useSettingsContext();
  const t = useT();

  // ── Toggle component ──
  const Toggle = ({ label, desc, value, onValue }: { label: string; desc?: string; value: boolean; onValue: (v: boolean) => void }) => (
    <View className="flex-row items-center justify-between py-3">
      <View className="flex-1 pr-4">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {desc ? <Text className="mt-0.5 text-xs text-muted-foreground">{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValue}
        trackColor={{ false: '#cbd5e1', true: '#3b82f6' as any }}
      />
    </View>
  );

  // ── Segmented control ──
  const Segmented = ({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) => (
    <View className="py-2">
      <Text className="mb-2 text-sm font-medium text-foreground">{label}</Text>
      <View className="flex-row rounded-lg border border-border bg-muted p-1">
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={`flex-1 rounded-md px-3 py-2 ${
              value === opt.value ? 'bg-background shadow-sm' : ''
            }`}
          >
            <Text className={`text-center text-sm font-medium ${
              value === opt.value ? 'text-foreground' : 'text-muted-foreground'
            }`}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (!loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">{t('msg.loading')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1 px-4 py-5">
        <Text className="text-2xl font-bold text-foreground">{t('title.settings')}</Text>

        {/* ═══ DISPLAY ═══ */}
        <View className="mt-6">
          <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('setting.display')}</Text>

          <View className="rounded-xl border border-border bg-card p-4">
            <Segmented
              label={t('label.theme')}
              value={display.theme}
              onChange={(v) => set('display.theme', v as any)}
              options={[
                { value: 'light', label: '☀️ Light' },
                { value: 'dark', label: '🌙 Dark' },
                { value: 'system', label: '💻 System' },
              ]}
            />

            <Toggle
              label={t('label.show_translation')}
              desc={t('msg.show_translation_desc')}
              value={display.translation}
              onValue={(v) => set('display.translation', v)}
            />

            <Toggle
              label={t('label.enable_popup_dictionary')}
              desc={t('msg.enable_popup_dictionary_desc')}
              value={display.popupDictionary ?? true}
              onValue={(v) => set('display.popupDictionary', v)}
            />
          </View>
        </View>

        {/* ═══ PLAYBACK ═══ */}
        <View className="mt-6">
          <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('setting.playback')}</Text>
          <View className="rounded-xl border border-border bg-card p-4">
            <Toggle
              label={t('label.auto_pause')}
              desc={t('msg.auto_pause_desc')}
              value={display.autoPause ?? false}
              onValue={(v) => set('display.autoPause', v)}
            />
          </View>
        </View>

        {/* ═══ REVIEW / SRS ═══ */}
        <View className="mt-6 mb-8">
          <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('setting.review')}</Text>
          <View className="rounded-xl border border-border bg-card p-4">
            <Text className="text-sm text-muted-foreground">
              {t('msg.review_settings_desc')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
