import React from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';

export default function SettingsScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, set, loaded } = useSettingsContext();
  const t = useT();

  const Toggle = ({ label, desc, value, onValue }: { label: string; desc?: string; value: boolean; onValue: (v: boolean) => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#0f172a' }}>{label}</Text>
        {desc ? <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{desc}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValue} trackColor={{ false: '#cbd5e1', true: '#3b82f6' }} />
    </View>
  );

  const Segmented = ({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) => (
    <View style={{ paddingVertical: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: '#0f172a', marginBottom: 8 }}>{label}</Text>
      <View style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 4 }}>
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: 6,
              backgroundColor: value === opt.value ? '#fff' : 'transparent',
            }}
          >
            <Text style={{ textAlign: 'center', fontSize: 14, fontWeight: '500', color: value === opt.value ? '#0f172a' : '#94a3b8' }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (!loaded) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc', padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#0f172a', marginBottom: 20 }}>{t('title.settings')}</Text>

      {/* DISPLAY */}
      <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', padding: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>{'Display'}</Text>

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

        <Toggle label={t('label.show_translation')} desc={t('msg.show_translation_desc')} value={display.translation} onValue={(v) => set('display.translation', v)} />
        <Toggle label={t('label.enable_popup_dictionary')} desc={t('msg.enable_popup_dictionary_desc')} value={display.popupDictionary ?? true} onValue={(v) => set('display.popupDictionary', v)} />
      </View>

      {/* PLAYBACK */}
      <View style={{ marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', padding: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>{'Playback'}</Text>
        <Toggle label={t('label.auto_pause')} desc={t('msg.auto_pause_desc')} value={display.autoPause ?? false} onValue={(v) => set('display.autoPause', v)} />
      </View>

      {/* REVIEW / SRS */}
      <View style={{ marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', padding: 16, marginBottom: 32 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>{'SRS Review'}</Text>
        <Text style={{ fontSize: 14, color: '#64748b' }}>{t('msg.review_settings_desc')}</Text>
      </View>
    </ScrollView>
  );
}
