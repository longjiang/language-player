import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  h1: { fontSize: 22, fontWeight: '700', color: '#0f172a', padding: 16, paddingBottom: 8 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, gap: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, marginBottom: 2 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#3b82f6', backgroundColor: '#eff6ff' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: '#3b82f6' },
  section: { marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, backgroundColor: '#fff', padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  toggleLabel: { flex: 1, paddingRight: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  desc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  segRow: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 3 },
  segBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 6 },
  segBtnActive: { backgroundColor: '#f1f5f9' },
  segText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  segTextActive: { color: '#0f172a' },
  preview: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, backgroundColor: '#f8fafc', marginTop: 8 },
  previewText: { fontSize: 15, lineHeight: 24, color: '#0f172a' },
  sizeCtrl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  sizeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  sizeBtnText: { fontSize: 18, color: '#0f172a' },
  sizeVal: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
});

const SAMPLES: Record<string, string> = {
  zh: '好好学习，天天向上。', ja: '毎日少しずつ日本語を勉強しています。', ko: '매일 조금씩 한국어를 공부하고 있어요.',
  en: 'The quick brown fox jumps over the lazy dog.', fr: 'Le renard brun rapide saute par-dessus le chien paresseux.',
  de: 'Der schnelle braune Fuchs springt über den faulen Hund.', es: 'El rápido zorro marrón salta sobre el perro perezoso.',
  ru: 'Быстрая коричневая лиса прыгает через ленивую собаку.', vi: 'Con cáo nâu nhanh nhẹn nhảy qua con chó lười biếng.',
};

export default function SettingsScreen() {
  const { l2Lang } = useLanguage();
  const { display, updateDisplay, tokenizedText, updateTokenizedText, playback, updatePlayback, review, updateReview, loaded } = useSettingsContext();
  const t = useT();
  const [tab, setTab] = useState('display');

  if (!loaded) return null;

  const TABS = [
    { key: 'display', label: 'Display' },
    { key: 'playback', label: 'Playback' },
    { key: 'review', label: 'Review' },
  ];

  const previewText = SAMPLES[l2Lang.code] ?? SAMPLES.en!;

  const Toggle = ({ label, d, value, onChange }: { label: string; d?: string; value: boolean; onChange: (v: boolean) => void }) => (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLabel}>
        <Text style={styles.label}>{label}</Text>
        {d ? <Text style={styles.desc}>{d}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: '#cbd5e1', true: '#3b82f6' }} />
    </View>
  );

  const Segmented = ({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) => (
    <View style={{ paddingVertical: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.segRow, { marginTop: 8 }]}>
        {options.map((v) => (
          <Pressable key={v} onPress={() => onChange(v)} style={[styles.segBtn, value === v && styles.segBtnActive]}>
            <Text style={[styles.segText, value === v && styles.segTextActive]}>{v[0]!.toUpperCase() + v.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const TextSizeControl = ({ label, value, onChange, min = 8, max = 72 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) => (
    <View style={styles.sizeCtrl}>
      <Text style={styles.label}>{label} ({value})</Text>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Pressable onPress={() => onChange(Math.max(min, value - 2))} style={styles.sizeBtn}>
          <Text style={styles.sizeBtnText}>A-</Text>
        </Pressable>
        <Text style={styles.sizeVal}>{value}</Text>
        <Pressable onPress={() => onChange(Math.min(max, value + 2))} style={styles.sizeBtn}>
          <Text style={styles.sizeBtnText}>A+</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.root}>
      <Text style={styles.h1}>{t('title.settings')}</Text>

      {/* Tab bar */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ═══ DISPLAY ═══ */}
      {tab === 'display' && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <Segmented label={t('label.theme')} options={['light','dark','system']} value={display.theme} onChange={(v) => updateDisplay({ theme: v as any })} />
            <Toggle label={t('label.show_translation')} d={t('msg.show_translation_desc')} value={display.translation} onChange={(v) => updateDisplay({ translation: v })} />
            <Toggle label={t('label.enable_popup_dictionary')} d={t('msg.enable_popup_dictionary_desc')} value={display.popupDictionary ?? true} onChange={(v) => updateDisplay({ popupDictionary: v })} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Text Appearance</Text>
            <Segmented label="Font" options={['default','serif','sans-serif']} value={tokenizedText.fontFamily} onChange={(v) => updateTokenizedText({ fontFamily: v as any })} />
            <TextSizeControl label="Text size" value={tokenizedText.fontSize} onChange={(v) => updateTokenizedText({ fontSize: v })} />
            <View style={styles.preview}>
              <Text style={[styles.previewText, { fontFamily: tokenizedText.fontFamily === 'serif' ? 'Georgia' : tokenizedText.fontFamily === 'sans-serif' ? 'Arial' : undefined, fontSize: tokenizedText.fontSize }]}>{previewText}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Phonetics</Text>
            <Segmented label="Display" options={['ontop','replace','off']} value={tokenizedText.phoneticsDisplay} onChange={(v) => updateTokenizedText({ phoneticsDisplay: v as any })} />
            <Segmented label="Show when" options={['always','hardWords']} value={tokenizedText.phoneticsCondition} onChange={(v) => updateTokenizedText({ phoneticsCondition: v as any })} />
            <Toggle label={t('label.show_pinyin')} value={tokenizedText.showPinyin ?? true} onChange={(v) => updateTokenizedText({ showPinyin: v })} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Word Levels</Text>
            <Toggle label="Show CEFR levels" value={tokenizedText.showLevel ?? true} onChange={(v) => updateTokenizedText({ showLevel: v })} />
            <Toggle label="Show word info icon" value={tokenizedText.showWordInfo ?? true} onChange={(v) => updateTokenizedText({ showWordInfo: v })} />
            <Toggle label={t('label.show_word_history')} value={tokenizedText.showWordHistory ?? true} onChange={(v) => updateTokenizedText({ showWordHistory: v })} />
          </View>
        </>
      )}

      {/* ═══ PLAYBACK ═══ */}
      {tab === 'playback' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playback</Text>
          <Toggle label={t('label.auto_pause')} d={t('msg.auto_pause_desc')} value={playback.autoPause} onChange={(v) => updatePlayback({ autoPause: v })} />
          <Toggle label="Karaoke mode" value={playback.karaokeMode} onChange={(v) => updatePlayback({ karaokeMode: v })} />
          <Toggle label="Smooth scroll" value={playback.smoothScroll} onChange={(v) => updatePlayback({ smoothScroll: v })} />
        </View>
      )}

      {/* ═══ REVIEW ═══ */}
      {tab === 'review' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SRS Review</Text>
          <TextSizeControl label="New cards per day" value={review.dailyNewLimit} onChange={(v) => updateReview({ dailyNewLimit: v })} min={1} max={50} />
          <Text style={[styles.desc, { marginTop: 8 }]}>{t('msg.review_settings_desc')}</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
