import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';

export default function SettingsScreen() {
  const { l2Lang } = useLanguage();
  const {
    tokenizedText, updateTokenizedText,
    display, updateDisplay,
    playback, updatePlayback,
    review, updateReview,
    getL2, updateL2, ensureL2,
    loaded,
  } = useSettingsContext();
  const t = useT();

  const [tab, setTab] = useState<'display' | 'playback' | 'review'>('display');

  useEffect(() => { if (loaded) ensureL2(l2Lang.code); }, [l2Lang.code, loaded]);

  const l2Settings = getL2(l2Lang.code);
  const popupEnabled = tokenizedText.enabled;

  if (!loaded) return null;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View className="mb-5">
      <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">{title}</Text>
      {children}
    </View>
  );

  const Toggle = ({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <View className="flex-row items-center justify-between py-2.5">
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {desc ? <Text className="mt-0.5 text-xs text-muted-foreground">{desc}</Text> : null}
      </View>
      <Switch value={checked} onValueChange={onChange} />
    </View>
  );

  const Segmented = ({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) => (
    <View className="mb-3">
      <Text className="mb-2 text-sm font-medium text-foreground">{label}</Text>
      <View className="flex-row rounded-lg border border-border bg-muted p-1">
        {options.map((opt) => (
          <Pressable key={opt.value} onPress={() => onChange(opt.value)}
            className={`flex-1 rounded-md px-3 py-2 ${
              value === opt.value ? 'bg-background shadow-sm' : ''
            }`}>
            <Text className={`text-center text-sm font-medium ${
              value === opt.value ? 'text-foreground' : 'text-muted-foreground'
            }`}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const TABS = [
    { key: 'display' as const, label: t('setting.display') },
    { key: 'playback' as const, label: t('setting.playback') },
    { key: 'review' as const, label: t('setting.review') },
  ];

  return (
    <ScrollView className="flex-1 bg-background px-4 py-8">
      <Text className="text-3xl font-bold text-foreground">{t('title.settings')}</Text>

      {/* Tab bar */}
      <View className="mt-6 flex-row rounded-lg border border-border bg-muted p-1">
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)}
            className={`flex-1 rounded-md py-2 ${
              tab === t.key ? 'bg-background shadow-sm' : ''
            }`}>
            <Text className={`text-center text-sm font-medium ${
              tab === t.key ? 'text-foreground' : 'text-muted-foreground'
            }`}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ═══ DISPLAY ═══ */}
      {tab === 'display' && (
        <View className="mt-6">
          <Section title={t('setting.theme')}>
            <Segmented label={t('label.theme')} value={display.theme}
              onChange={(v: string) => updateDisplay({ theme: v as 'light' | 'dark' | 'system' })}
              options={[
                { value: 'light', label: '☀️ ' + t('setting.light') },
                { value: 'dark', label: '🌙 ' + t('setting.dark') },
                { value: 'system', label: '💻 ' + t('setting.system') },
              ]} />
          </Section>

          <Section title="">
            <Toggle label={t('label.show_translation')} desc={t('msg.show_translation_desc')}
              checked={display.translation} onChange={(v) => updateDisplay({ translation: v })} />
            <Toggle label={t('label.enable_popup_dictionary')} desc={t('msg.enable_popup_dictionary_desc')}
              checked={tokenizedText.enabled} onChange={(v) => updateTokenizedText({ enabled: v })} />
          </Section>

          {popupEnabled && (
            <Section title={t('setting.text_appearance')}>
              <Toggle label={t('label.show_gloss_saved')} desc={t('msg.show_gloss_saved_desc')}
                checked={tokenizedText.quickGloss} onChange={(v) => updateTokenizedText({ quickGloss: v })} />
              <Toggle label={t('label.show_interlinear_gloss')} desc={t('msg.show_definition_desc')}
                checked={l2Settings.tokenSpan.definition.show}
                onChange={(v) => {
                  const ts = l2Settings.tokenSpan;
                  updateL2(l2Lang.code, { tokenSpan: { ...ts, definition: { ...ts.definition, show: v } } });
                }} />
            </Section>
          )}

          {popupEnabled && (
            <Section title={t('setting.word_level_display')}>
              <Toggle label={t('label.show_word_history')}
                checked={tokenizedText.showWordHistory}
                onChange={(v) => updateTokenizedText({ showWordHistory: v })} />
            </Section>
          )}
        </View>
      )}

      {/* ═══ PLAYBACK ═══ */}
      {tab === 'playback' && (
        <View className="mt-6">
          <Section title={t('setting.playback')}>
            <Toggle label={t('label.transcript_mode')} desc={t('msg.transcript_mode_desc')}
              checked={playback.transcriptMode === 'transcript'}
              onChange={(v) => updatePlayback({ transcriptMode: v ? 'transcript' : 'subtitles' })} />
            <Toggle label={t('label.smooth_scroll')}
              checked={playback.smoothScroll} onChange={(v) => updatePlayback({ smoothScroll: v })} />
            <Toggle label={t('label.karaoke')}
              checked={playback.karaokeMode} onChange={(v) => updatePlayback({ karaokeMode: v })} />
          </Section>

          <Toggle label={t('label.auto_pause')}
            checked={playback.autoPause} onChange={(v) => updatePlayback({ autoPause: v })} />
          <Toggle label={t('label.collapse_video')}
            checked={playback.collapsedVideo} onChange={(v) => updatePlayback({ collapsedVideo: v })} />
        </View>
      )}

      {/* ═══ REVIEW ═══ */}
      {tab === 'review' && (
        <View className="mt-6">
          <Section title="">
            <View className="flex-row items-center justify-between py-2.5">
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">{t('label.new_cards_per_day')}</Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">{t('msg.new_cards_per_day_desc')}</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Pressable onPress={() => updateReview({ dailyNewLimit: Math.max(1, review.dailyNewLimit - 1) })}
                  className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Text className="text-lg text-foreground">−</Text>
                </Pressable>
                <Text className="w-8 text-center text-base font-semibold tabular-nums text-foreground">{review.dailyNewLimit}</Text>
                <Pressable onPress={() => updateReview({ dailyNewLimit: Math.min(50, review.dailyNewLimit + 1) })}
                  className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Text className="text-lg text-foreground">+</Text>
                </Pressable>
              </View>
            </View>
          </Section>
        </View>
      )}
    </ScrollView>
  );
}
