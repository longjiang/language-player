import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { getSampleSentence } from '@/lib/sample-sentences';

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  h1: { fontSize: 28, fontWeight: '700', color: '#000', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 4 },
  tabRow: { flexDirection: 'row', margin: 16, marginTop: 20, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 7 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  tabText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: '#0f172a' },
  section: { marginBottom: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 8, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  toggleLeft: { flex: 1, paddingRight: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  desc: { fontSize: 12, color: '#64748b', marginTop: 1 },
  segLabel: { fontSize: 14, fontWeight: '500', color: '#0f172a', marginBottom: 6 },
  segRow: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', padding: 3 },
  segBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  segBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  segTextActive: { color: '#0f172a' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  stepperLeft: { flex: 1 },
  stepperBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 20, color: '#0f172a' },
  stepperVal: { width: 40, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#0f172a' },
  preview: { borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', padding: 12 },
  previewText: { fontSize: 14, lineHeight: 22, color: '#0f172a' },
  placeholder: { borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 24, alignItems: 'center' },
  placeholderText: { textAlign: 'center', fontSize: 14, color: '#64748b' },
});

export default function SettingsScreen() {
  const { l2Lang } = useLanguage();
  const { tokenizedText, updateTokenizedText, display, updateDisplay, playback, updatePlayback, review, updateReview, getL2, updateL2, ensureL2, loaded } = useSettingsContext();
  const t = useT();
  const [tab, setTab] = useState<'display'|'playback'|'speech'|'review'>('display');

  useEffect(() => { if (loaded) ensureL2(l2Lang.code); }, [l2Lang.code, loaded]);

  const l2Settings = getL2(l2Lang.code);
  const popupEnabled = tokenizedText.enabled;
  const previewText = getSampleSentence(l2Lang.code);
  const isChinese = l2Lang.code === 'zh', isKorean = l2Lang.code === 'ko', isVietnamese = l2Lang.code === 'vi';

  if (!loaded) return null;

  const TABS = [
    { key: 'display' as const, label: t('setting.display') },
    { key: 'playback' as const, label: t('setting.playback') },
    { key: 'speech' as const, label: t('setting.speech') },
    { key: 'review' as const, label: t('setting.review') },
  ];

  return (
    <ScrollView style={S.root}>
      <Text style={S.h1}>{t('title.settings')}</Text>

      <View style={S.tabRow}>
        {TABS.map(tabKey => (
          <Pressable key={tabKey.key} onPress={() => setTab(tabKey.key)} style={[S.tab, tab === tabKey.key && S.tabActive]}>
            <Text style={[S.tabText, tab === tabKey.key && S.tabTextActive]}>{tabKey.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'display' && <View style={{ paddingTop: 4 }}>
        <View style={S.section}>
          <Text style={S.sectionTitle}>{t('setting.theme')}</Text>
          <Text style={S.segLabel}>{t('label.theme')}</Text>
          <View style={S.segRow}>
            {(['light','dark','system'] as const).map(v => (
              <Pressable key={v} onPress={() => updateDisplay({ theme: v })} style={[S.segBtn, display.theme === v && S.segBtnActive]}>
                <Text style={[S.segText, display.theme === v && S.segTextActive]}>
                  {v === 'light' ? '☀️ ' + t('setting.light') : v === 'dark' ? '🌙 ' + t('setting.dark') : '💻 ' + t('setting.system')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={S.section}>
          <View style={S.toggleRow}>
            <View style={S.toggleLeft}><Text style={S.label}>{t('label.show_translation')}</Text><Text style={S.desc}>{t('msg.show_translation_desc')}</Text></View>
            <Switch value={display.translation} onValueChange={(v) => updateDisplay({ translation: v })} />
          </View>
          <View style={S.toggleRow}>
            <View style={S.toggleLeft}><Text style={S.label}>{t('label.enable_popup_dictionary')}</Text><Text style={S.desc}>{t('msg.enable_popup_dictionary_desc')}</Text></View>
            <Switch value={tokenizedText.enabled} onValueChange={(v) => updateTokenizedText({ enabled: v })} />
          </View>
        </View>

        {popupEnabled && <View style={S.section}>
          <Text style={S.sectionTitle}>{t('label.tokenized_text_preview')}</Text>
          <View style={S.preview}><Text style={S.previewText}>{previewText}</Text></View>
        </View>}

        {popupEnabled && <>
          <View style={S.section}>
            <Text style={S.sectionTitle}>{t('setting.text_appearance')}</Text>
            <Text style={S.segLabel}>{t('label.font')}</Text>
            <View style={S.segRow}>
              {(['default','serif','sans-serif'] as const).map(v => (
                <Pressable key={v} onPress={() => updateTokenizedText({ typeFace: v })} style={[S.segBtn, tokenizedText.typeFace === v && S.segBtnActive]}>
                  <Text style={[S.segText, tokenizedText.typeFace === v && S.segTextActive]}>{t(`setting.font_${v === 'default' ? 'default' : v === 'serif' ? 'serif' : 'sans_serif'}`)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={S.stepperRow}>
              <View style={S.stepperLeft}><Text style={S.label}>{t('label.text_size')}</Text></View>
              <Pressable onPress={() => updateTokenizedText({ zoom: Math.max(0, tokenizedText.zoom - 1) })} style={S.stepperBtn}><Text style={S.stepperBtnText}>−</Text></Pressable>
              <Text style={S.stepperVal}>{tokenizedText.zoom}</Text>
              <Pressable onPress={() => updateTokenizedText({ zoom: Math.min(7, tokenizedText.zoom + 1) })} style={S.stepperBtn}><Text style={S.stepperBtnText}>+</Text></Pressable>
            </View>
          </View>

          <View style={S.section}>
            <Text style={S.sectionTitle}>{t('setting.phonetics')}</Text>
            <Text style={S.segLabel}>{t('label.show_phonetics')}</Text>
            <View style={S.segRow}>
              {(['ruby','word','off'] as const).map(v => (
                <Pressable key={v} onPress={() => {
                  const ts = l2Settings.tokenSpan;
                  updateL2(l2Lang.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, show: v === 'off' ? false : v as any, conditions: v === 'word' ? 'always' as const : ts.phonetics.conditions } } });
                }} style={[S.segBtn, (l2Settings.tokenSpan.phonetics.show === false ? 'off' : l2Settings.tokenSpan.phonetics.show) === v && S.segBtnActive]}>
                  <Text style={[S.segText, (l2Settings.tokenSpan.phonetics.show === false ? 'off' : l2Settings.tokenSpan.phonetics.show) === v && S.segTextActive]}>{t(v === 'ruby' ? 'setting.phonetics_on_top' : v === 'word' ? 'setting.phonetics_replace' : 'setting.off')}</Text>
                </Pressable>
              ))}
            </View>
            {l2Settings.tokenSpan.phonetics.show === 'ruby' && <>
              <Text style={[S.segLabel, { marginTop: 16 }]}>{t('label.phonetics_conditions')}</Text>
              <View style={S.segRow}>
                {(['always','hardWords'] as const).map(v => (
                  <Pressable key={v} onPress={() => {
                    const ts = l2Settings.tokenSpan;
                    updateL2(l2Lang.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, conditions: v } } });
                  }} style={[S.segBtn, l2Settings.tokenSpan.phonetics.conditions === v && S.segBtnActive]}>
                    <Text style={[S.segText, l2Settings.tokenSpan.phonetics.conditions === v && S.segTextActive]}>{t(v === 'always' ? 'setting.all_words' : 'setting.hard_words_only')}</Text>
                  </Pressable>
                ))}
              </View>
            </>}
          </View>

          <View style={S.section}>
            <Text style={S.sectionTitle}>{t('setting.word_level_display')}</Text>
            <View style={S.toggleRow}>
              <View style={S.toggleLeft}><Text style={S.label}>{t('label.show_gloss_saved')}</Text><Text style={S.desc}>{t('msg.show_gloss_saved_desc')}</Text></View>
              <Switch value={tokenizedText.quickGloss} onValueChange={(v) => updateTokenizedText({ quickGloss: v })} />
            </View>
            <View style={S.toggleRow}>
              <View style={S.toggleLeft}><Text style={S.label}>{t('label.show_interlinear_gloss')}</Text><Text style={S.desc}>{t('msg.show_definition_desc')}</Text></View>
              <Switch value={l2Settings.tokenSpan.definition.show} onValueChange={(v) => updateL2(l2Lang.code, { tokenSpan: { ...l2Settings.tokenSpan, definition: { ...l2Settings.tokenSpan.definition, show: v } } })} />
            </View>
            {isChinese && <>
              <Text style={[S.segLabel, { marginTop: 8 }]}>{t('label.character_set')}</Text>
              <View style={S.segRow}>
                {([{v:'false',l:'简 '+t('setting.simplified')},{v:'true',l:'繁 '+t('setting.traditional')}] as const).map(o => (
                  <Pressable key={o.v} onPress={() => updateL2(l2Lang.code, { display: { ...l2Settings.display, traditional: o.v === 'true' } })} style={[S.segBtn, String(l2Settings.display.traditional) === o.v && S.segBtnActive]}>
                    <Text style={[S.segText, String(l2Settings.display.traditional) === o.v && S.segTextActive]}>{o.l}</Text>
                  </Pressable>
                ))}
              </View>
            </>}
            {isKorean && <View style={S.toggleRow}>
              <View style={S.toggleLeft}><Text style={S.label}>{t('label.show_hanja')}</Text></View>
              <Switch value={(l2Settings.display as any).hanja !== false} onValueChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, hanja: v } } as any)} />
            </View>}
            {isVietnamese && <View style={S.toggleRow}>
              <View style={S.toggleLeft}><Text style={S.label}>{t('label.show_hantu')}</Text></View>
              <Switch value={(l2Settings.display as any).byeonggi !== false} onValueChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, byeonggi: v } } as any)} />
            </View>}
          </View>

          <View style={S.section}>
            <Text style={S.sectionTitle}>{t('setting.interaction')}</Text>
            <View style={S.toggleRow}>
              <View style={S.toggleLeft}><Text style={S.label}>{t('setting.quiz_mode')}</Text><Text style={S.desc}>{t('msg.quiz_mode_desc')}</Text></View>
              <Switch value={tokenizedText.mode === 'quiz'} onValueChange={(v) => updateTokenizedText({ mode: v ? 'quiz' : 'normal' })} />
            </View>
          </View>
        </>}
      </View>}

      {tab === 'playback' && <View style={{ paddingTop: 4 }}>
        <View style={S.section}>
          <Text style={S.sectionTitle}>{t('setting.captions')}</Text>
          <View style={S.toggleRow}>
            <View style={S.toggleLeft}><Text style={S.label}>{t('label.transcript_mode')}</Text><Text style={S.desc}>{t('msg.transcript_mode_desc')}</Text></View>
            <Switch value={playback.transcriptMode === 'transcript'} onValueChange={(v) => updatePlayback({ transcriptMode: v ? 'transcript' : 'subtitles' })} />
          </View>
          <View style={S.toggleRow}>
            <View style={S.toggleLeft}><Text style={S.label}>{t('label.smooth_scroll')}</Text></View>
            <Switch value={playback.smoothScroll} onValueChange={(v) => updatePlayback({ smoothScroll: v })} />
          </View>
          <View style={S.toggleRow}>
            <View style={S.toggleLeft}><Text style={S.label}>{t('label.karaoke')}</Text></View>
            <Switch value={playback.karaokeMode} onValueChange={(v) => updatePlayback({ karaokeMode: v })} />
          </View>
        </View>
        <View style={S.section}>
          <View style={S.toggleRow}>
            <View style={S.toggleLeft}><Text style={S.label}>{t('label.auto_pause')}</Text></View>
            <Switch value={playback.autoPause} onValueChange={(v) => updatePlayback({ autoPause: v })} />
          </View>
          <View style={S.toggleRow}>
            <View style={S.toggleLeft}><Text style={S.label}>{t('label.collapse_video')}</Text></View>
            <Switch value={playback.collapsedVideo} onValueChange={(v) => updatePlayback({ collapsedVideo: v })} />
          </View>
        </View>
      </View>}

      {tab === 'speech' && <View style={S.section}>
        <View style={S.placeholder}>
          <Text style={S.placeholderText}>{t('msg.speech_settings_coming_soon')}</Text>
        </View>
      </View>}

      {tab === 'review' && <View style={S.section}>
        <View style={S.stepperRow}>
          <View style={S.stepperLeft}><Text style={S.label}>{t('label.new_cards_per_day')}</Text><Text style={S.desc}>{t('msg.new_cards_per_day_desc')}</Text></View>
          <Pressable onPress={() => updateReview({ dailyNewLimit: Math.max(1, review.dailyNewLimit - 1) })} style={S.stepperBtn}><Text style={S.stepperBtnText}>−</Text></Pressable>
          <Text style={S.stepperVal}>{review.dailyNewLimit}</Text>
          <Pressable onPress={() => updateReview({ dailyNewLimit: Math.min(50, review.dailyNewLimit + 1) })} style={S.stepperBtn}><Text style={S.stepperBtnText}>+</Text></Pressable>
        </View>
      </View>}
    </ScrollView>
  );
}
