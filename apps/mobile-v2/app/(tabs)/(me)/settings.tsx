import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { getSampleSentence } from '@/lib/sample-sentences';

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

  const [tab, setTab] = useState<'display' | 'playback' | 'speech' | 'review'>('display');
  const isChinese = l2Lang.code === 'zh';
  const isKorean = l2Lang.code === 'ko';
  const isVietnamese = l2Lang.code === 'vi';

  useEffect(() => { if (loaded) ensureL2(l2Lang.code); }, [l2Lang.code, loaded]);

  const l2Settings = getL2(l2Lang.code);
  const phoneticsEnabled = l2Settings.tokenSpan.phonetics.show !== false;
  const popupEnabled = tokenizedText.enabled;
  const previewText = getSampleSentence(l2Lang.code);

  if (!loaded) return null;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View className="mb-5">
      {title ? <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">{title}</Text> : null}
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
            className={`flex-1 rounded-md px-3 py-2 ${value === opt.value ? 'bg-background shadow-sm' : ''}`}>
            <Text className={`text-center text-sm font-medium ${value === opt.value ? 'text-foreground' : 'text-muted-foreground'}`}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const Stepper = ({ label, desc, min, max, value, onChange }: { label: string; desc?: string; min: number; max: number; value: number; onChange: (v: number) => void }) => (
    <View className="flex-row items-center justify-between py-2.5">
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {desc ? <Text className="mt-0.5 text-xs text-muted-foreground">{desc}</Text> : null}
      </View>
      <View className="flex-row items-center gap-3">
        <Pressable onPress={() => onChange(Math.max(min, value - 1))} className="h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Text className="text-lg text-foreground">−</Text>
        </Pressable>
        <Text className="w-8 text-center text-base font-semibold tabular-nums text-foreground">{value}</Text>
        <Pressable onPress={() => onChange(Math.min(max, value + 1))} className="h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Text className="text-lg text-foreground">+</Text>
        </Pressable>
      </View>
    </View>
  );

  const TABS = [
    { key: 'display' as const, label: t('setting.display') },
    { key: 'playback' as const, label: t('setting.playback') },
    { key: 'speech' as const, label: t('setting.speech') },
    { key: 'review' as const, label: t('setting.review') },
  ];

  return (
    <ScrollView className="flex-1 bg-background px-4 py-8">
      <Text className="text-3xl font-bold text-foreground">{t('title.settings')}</Text>

      {/* Tab bar */}
      <View className="mt-6 flex-row rounded-lg border border-border bg-muted p-1">
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)}
            className={`flex-1 rounded-md py-2 ${tab === t.key ? 'bg-background shadow-sm' : ''}`}>
            <Text className={`text-center text-sm font-medium ${tab === t.key ? 'text-foreground' : 'text-muted-foreground'}`}>{t.label}</Text>
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
            <Section title={t('label.tokenized_text_preview')}>
              <View className="rounded-lg border border-border bg-muted/50 p-4">
                <Text className="text-sm leading-relaxed text-foreground">{previewText}</Text>
              </View>
            </Section>
          )}

          {popupEnabled && (<>
            <Section title={t('setting.text_appearance')}>
              <Segmented label={t('label.font')} value={tokenizedText.typeFace}
                onChange={(v: string) => updateTokenizedText({ typeFace: v as 'default' | 'serif' | 'sans-serif' })}
                options={[
                  { value: 'default', label: t('setting.font_default') },
                  { value: 'serif', label: t('setting.font_serif') },
                  { value: 'sans-serif', label: t('setting.font_sans_serif') },
                ]} />
              <Stepper label={t('label.text_size')} min={0} max={7} value={tokenizedText.zoom}
                onChange={(v) => updateTokenizedText({ zoom: v })} />
            </Section>

            <Section title={t('setting.phonetics')}>
              <Segmented label={t('label.show_phonetics')}
                value={l2Settings.tokenSpan.phonetics.show === false ? 'off' : l2Settings.tokenSpan.phonetics.show}
                onChange={(v: string) => {
                  const ts = l2Settings.tokenSpan;
                  updateL2(l2Lang.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, show: v === 'off' ? false : v as 'ruby' | 'word', conditions: v === 'word' ? ('always' as const) : ts.phonetics.conditions } } });
                }}
                options={[
                  { value: 'ruby', label: t('setting.phonetics_on_top') },
                  { value: 'word', label: t('setting.phonetics_replace') },
                  { value: 'off', label: t('setting.off') },
                ]} />
              {l2Settings.tokenSpan.phonetics.show === 'ruby' && (
                <Segmented label={t('label.phonetics_conditions')} value={l2Settings.tokenSpan.phonetics.conditions}
                  onChange={(v: string) => {
                    const ts = l2Settings.tokenSpan;
                    updateL2(l2Lang.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, conditions: v as 'always' | 'hardWords' } } });
                  }}
                  options={[
                    { value: 'always', label: t('setting.all_words') },
                    { value: 'hardWords', label: t('setting.hard_words_only') },
                  ]} />
              )}
            </Section>

            <Section title={t('setting.word_level_display')}>
              <Toggle label={t('label.show_gloss_saved')} desc={t('msg.show_gloss_saved_desc')}
                checked={tokenizedText.quickGloss} onChange={(v) => updateTokenizedText({ quickGloss: v })} />
              <Toggle label={t('label.show_interlinear_gloss')} desc={t('msg.show_definition_desc')}
                checked={l2Settings.tokenSpan.definition.show}
                onChange={(v) => {
                  const ts = l2Settings.tokenSpan;
                  updateL2(l2Lang.code, { tokenSpan: { ...ts, definition: { ...ts.definition, show: v } } });
                }} />
              {isChinese && (
                <Segmented label={t('label.character_set')} value={String(l2Settings.display.traditional)}
                  onChange={(v: string) => {
                    updateL2(l2Lang.code, { display: { ...l2Settings.display, traditional: v === 'true' } });
                  }}
                  options={[
                    { value: 'false', label: '简 ' + t('setting.simplified') },
                    { value: 'true', label: '繁 ' + t('setting.traditional') },
                  ]} />
              )}
              {isKorean && (
                <Toggle label={t('label.show_hanja')}
                  checked={l2Settings.display.hanja !== false}
                  onChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, hanja: v } })} />
              )}
              {isVietnamese && (
                <Toggle label={t('label.show_hantu')}
                  checked={l2Settings.display.byeonggi !== false}
                  onChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, byeonggi: v } })} />
              )}
            </Section>

            <Section title={t('setting.interaction')}>
              <Toggle label={t('setting.quiz_mode')} desc={t('msg.quiz_mode_desc')}
                checked={tokenizedText.mode === 'quiz'}
                onChange={(v) => updateTokenizedText({ mode: v ? 'quiz' : 'normal' })} />
            </Section>
          </>)}
        </View>
      )}

      {/* ═══ PLAYBACK ═══ */}
      {tab === 'playback' && (
        <View className="mt-6">
          <Section title={t('setting.captions')}>
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

      {/* ═══ SPEECH ═══ */}
      {tab === 'speech' && (
        <View className="mt-6">
          <Section title="">
            <View className="rounded-lg border border-border bg-card p-6">
              <Text className="text-center text-sm text-muted-foreground">{t('msg.speech_settings_coming_soon')}</Text>
            </View>
          </Section>
        </View>
      )}

      {/* ═══ REVIEW ═══ */}
      {tab === 'review' && (
        <View className="mt-6">
          <Section title="">
            <Stepper label={t('label.new_cards_per_day')} desc={t('msg.new_cards_per_day_desc')}
              min={1} max={50} value={review.dailyNewLimit}
              onChange={(v) => updateReview({ dailyNewLimit: v })} />
          </Section>
        </View>
      )}
    </ScrollView>
  );
}
