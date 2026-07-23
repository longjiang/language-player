import React from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';

export default function SettingsScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay, loaded } = useSettingsContext();
  const t = useT();

  const section = { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, backgroundColor: '#fff', padding: 16 };
  const h1 = { fontSize: 24, fontWeight: 'bold' as const, color: '#0f172a', marginBottom: 20 };
  const sectionTitle = { fontSize: 12, fontWeight: '600' as const, color: '#94a3b8', textTransform: 'uppercase' as const, marginBottom: 8 };
  const label = { fontSize: 14, fontWeight: '500' as const, color: '#0f172a' };
  const desc = { fontSize: 12, color: '#64748b', marginTop: 2 };
  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 12 };
  const muted = { fontSize: 14, color: '#64748b' };

  if (!loaded) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc', padding: 16 }}>
      <Text style={h1}>{t('title.settings')}</Text>

      {/* DISPLAY */}
      <View style={[section, { marginTop: 8 }]}>
        <Text style={sectionTitle}>{'Display'}</Text>

        <View style={{ paddingVertical: 8 }}>
          <Text style={label}>{t('label.theme')}</Text>
          <View style={{ flexDirection: 'row', marginTop: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 4 }}>
            {['light','dark','system'].map((v) => (
              <Pressable key={v} onPress={() => updateDisplay({ theme: v as any })}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: display.theme === v ? '#e2e8f0' : 'transparent' }}>
                <Text style={{ textAlign: 'center', fontSize: 14, color: display.theme === v ? '#0f172a' : '#94a3b8' }}>
                  {v === 'light' ? '☀️ Light' : v === 'dark' ? '🌙 Dark' : '💻 System'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={row}>
          <View style={{ flex: 1 }}>
            <Text style={label}>{t('label.show_translation')}</Text>
            <Text style={desc}>{t('msg.show_translation_desc')}</Text>
          </View>
          <Switch value={display.translation} onValueChange={(v) => updateDisplay({ translation: v })} trackColor={{ false: '#cbd5e1', true: '#3b82f6' }} />
        </View>

        <View style={row}>
          <View style={{ flex: 1 }}>
            <Text style={label}>{t('label.enable_popup_dictionary')}</Text>
            <Text style={desc}>{t('msg.enable_popup_dictionary_desc')}</Text>
          </View>
          <Switch value={display.popupDictionary ?? true} onValueChange={(v) => updateDisplay({ popupDictionary: v })} trackColor={{ false: '#cbd5e1', true: '#3b82f6' }} />
        </View>
      </View>

      {/* PLAYBACK */}
      <View style={[section, { marginTop: 16 }]}>
        <Text style={sectionTitle}>{'Playback'}</Text>
        <View style={row}>
          <View style={{ flex: 1 }}>
            <Text style={label}>{t('label.auto_pause')}</Text>
            <Text style={desc}>{t('msg.auto_pause_desc')}</Text>
          </View>
          <Switch value={display.autoPause ?? false} onValueChange={(v) => updateDisplay({ autoPause: v })} trackColor={{ false: '#cbd5e1', true: '#3b82f6' }} />
        </View>
      </View>

      {/* REVIEW / SRS */}
      <View style={[section, { marginTop: 16, marginBottom: 32 }]}>
        <Text style={sectionTitle}>{'SRS Review'}</Text>
        <Text style={muted}>{t('msg.review_settings_desc')}</Text>
      </View>
    </ScrollView>
  );
}
