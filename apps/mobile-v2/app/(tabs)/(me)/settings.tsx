import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { getSampleSentence } from '@langplayer/shared';
import { VoicePicker } from '@/components/VoicePicker';
import { TokenizedText } from '@/components/TokenizedText';

// ── Reusable sub-components ──────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
      {title}
    </Text>
  );
}

function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  renderLabel: (v: T) => string;
}) {
  return (
    <View className="flex-row rounded-lg border border-border bg-muted p-0.5">
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          className={`flex-1 py-2 items-center rounded-md ${value === opt ? 'bg-card' : ''}`}
        >
          <Text className={`text-xs font-semibold ${value === opt ? 'text-foreground' : 'text-muted-foreground'}`}>
            {renderLabel(opt)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

type ToggleProps = {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
};

function ToggleRow({ label, desc, value, onValueChange }: ToggleProps) {
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <View className="flex-1 pr-4">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {desc && <Text className="text-xs text-muted-foreground mt-0.5">{desc}</Text>}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function StepperRow({
  label,
  desc,
  value,
  min,
  max,
  onIncrement,
  onDecrement,
}: {
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {desc && <Text className="text-xs text-muted-foreground mt-0.5">{desc}</Text>}
      </View>
      <Pressable
        onPress={onDecrement}
        disabled={value <= min}
        className="w-8 h-8 rounded-full bg-muted items-center justify-center"
      >
        <Text className={`text-lg ${value <= min ? 'text-muted-foreground/40' : 'text-foreground'}`}>−</Text>
      </Pressable>
      <Text className="w-10 text-center text-base font-semibold text-foreground">{value}</Text>
      <Pressable
        onPress={onIncrement}
        disabled={value >= max}
        className="w-8 h-8 rounded-full bg-muted items-center justify-center"
      >
        <Text className={`text-lg ${value >= max ? 'text-muted-foreground/40' : 'text-foreground'}`}>+</Text>
      </Pressable>
    </View>
  );
}

// ── Main Screen ──────────────────────────────

export default function SettingsScreen() {
  const { l2Lang } = useLanguage();
  const { tokenizedText, updateTokenizedText, display, updateDisplay, playback, updatePlayback, review, updateReview, getL2, updateL2, ensureL2, loaded } = useSettingsContext();
  const t = useT();
  const [tab, setTab] = useState<'display' | 'playback' | 'speech' | 'review'>('display');

  useEffect(() => { if (loaded) ensureL2(l2Lang.code); }, [l2Lang.code, loaded]);

  const l2Settings = getL2(l2Lang.code);
  const popupEnabled = tokenizedText.enabled;
  const previewText = getSampleSentence(l2Lang.code);
  const isChinese = l2Lang.code === 'zh';
  const isKorean = l2Lang.code === 'ko';
  const isVietnamese = l2Lang.code === 'vi';

  if (!loaded) return null;

  const TABS = [
    { key: 'display' as const, label: t('setting.display') },
    { key: 'playback' as const, label: t('setting.playback') },
    { key: 'speech' as const, label: t('setting.speech') },
    { key: 'review' as const, label: t('setting.review') },
  ];

  return (
    <ScrollView className="flex-1 bg-background">
      <Text className="text-3xl font-bold text-foreground px-4 pt-6 pb-1">{t('title.settings')}</Text>

      {/* ── Tab bar ── */}
      <View className="flex-row mx-4 mt-5 rounded-xl border border-border bg-muted p-0.5">
        {TABS.map((tKey) => (
          <Pressable
            key={tKey.key}
            onPress={() => setTab(tKey.key)}
            className={`flex-1 py-2 items-center rounded-lg ${tab === tKey.key ? 'bg-card' : ''}`}
          >
            <Text className={`text-sm font-semibold ${tab === tKey.key ? 'text-foreground' : 'text-muted-foreground'}`}>
              {tKey.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Display tab ── */}
      {tab === 'display' && (
        <View className="pt-1">
          <View className="mb-5 px-4">
            <SectionHeader title={t('setting.theme')} />
            <Text className="text-sm font-medium text-foreground mb-1.5">{t('label.theme')}</Text>
            <SegmentedRow
              options={['light', 'dark', 'system'] as const}
              value={display.theme}
              onChange={(v) => updateDisplay({ theme: v })}
              renderLabel={(v) =>
                v === 'light' ? `☀️ ${t('setting.light')}` : v === 'dark' ? `🌙 ${t('setting.dark')}` : `💻 ${t('setting.system')}`
              }
            />
          </View>

          <View className="mb-5 px-4">
            <ToggleRow label={t('label.show_translation')} desc={t('msg.show_translation_desc')} value={display.translation} onValueChange={(v) => updateDisplay({ translation: v })} />
            <ToggleRow label={t('label.enable_popup_dictionary')} desc={t('msg.enable_popup_dictionary_desc')} value={tokenizedText.enabled} onValueChange={(v) => updateTokenizedText({ enabled: v })} />
          </View>

          {popupEnabled && (
            <View className="mb-5 px-4">
              <SectionHeader title={t('label.tokenized_text_preview')} />
              <View className="rounded-lg border border-border bg-muted p-3">
                <TokenizedText text={previewText} l2Code={l2Lang.code} />
              </View>
            </View>
          )}

          {popupEnabled && (
            <>
              <View className="mb-5 px-4">
                <SectionHeader title={t('setting.text_appearance')} />
                <Text className="text-sm font-medium text-foreground mb-1.5">{t('label.font')}</Text>
                <SegmentedRow
                  options={['default', 'serif', 'sans-serif'] as const}
                  value={tokenizedText.typeFace}
                  onChange={(v) => updateTokenizedText({ typeFace: v })}
                  renderLabel={(v) => t(`setting.font_${v === 'default' ? 'default' : v === 'serif' ? 'serif' : 'sans_serif'}`)}
                />
                <StepperRow
                  label={t('label.text_size')}
                  value={tokenizedText.zoom}
                  min={0}
                  max={7}
                  onDecrement={() => updateTokenizedText({ zoom: Math.max(0, tokenizedText.zoom - 1) })}
                  onIncrement={() => updateTokenizedText({ zoom: Math.min(7, tokenizedText.zoom + 1) })}
                />
              </View>

              <View className="mb-5 px-4">
                <SectionHeader title={t('setting.phonetics')} />
                <Text className="text-sm font-medium text-foreground mb-1.5">{t('label.show_phonetics')}</Text>
                <SegmentedRow
                  options={['ruby', 'word', 'off'] as const}
                  value={l2Settings.tokenSpan.phonetics.show === false ? 'off' : l2Settings.tokenSpan.phonetics.show}
                  onChange={(v) => {
                    const ts = l2Settings.tokenSpan;
                    updateL2(l2Lang.code, {
                      tokenSpan: { ...ts, phonetics: { ...ts.phonetics, show: v === 'off' ? false : (v as any), conditions: v === 'word' ? ('always' as const) : ts.phonetics.conditions } },
                    });
                  }}
                  renderLabel={(v) => t(v === 'ruby' ? 'setting.phonetics_on_top' : v === 'word' ? 'setting.phonetics_replace' : 'setting.off')}
                />
                {l2Settings.tokenSpan.phonetics.show === 'ruby' && (
                  <>
                    <Text className="text-sm font-medium text-foreground mt-4 mb-1.5">{t('label.phonetics_conditions')}</Text>
                    <SegmentedRow
                      options={['always', 'hardWords'] as const}
                      value={l2Settings.tokenSpan.phonetics.conditions}
                      onChange={(v) => {
                        const ts = l2Settings.tokenSpan;
                        updateL2(l2Lang.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, conditions: v } } });
                      }}
                      renderLabel={(v) => t(v === 'always' ? 'setting.all_words' : 'setting.hard_words_only')}
                    />
                  </>
                )}
              </View>

              <View className="mb-5 px-4">
                <SectionHeader title={t('setting.word_level_display')} />
                <ToggleRow label={t('label.show_gloss_saved')} desc={t('msg.show_gloss_saved_desc')} value={tokenizedText.quickGloss} onValueChange={(v) => updateTokenizedText({ quickGloss: v })} />
                <ToggleRow label={t('label.show_interlinear_gloss')} desc={t('msg.show_definition_desc')} value={l2Settings.tokenSpan.definition.show} onValueChange={(v) => updateL2(l2Lang.code, { tokenSpan: { ...l2Settings.tokenSpan, definition: { ...l2Settings.tokenSpan.definition, show: v } } })} />
                {isChinese && (
                  <>
                    <Text className="text-sm font-medium text-foreground mt-2 mb-1.5">{t('label.character_set')}</Text>
                    <View className="flex-row rounded-lg border border-border bg-muted p-0.5">
                      {([{ v: 'false', l: `简 ${t('setting.simplified')}` }, { v: 'true', l: `繁 ${t('setting.traditional')}` }] as const).map((o) => (
                        <Pressable
                          key={o.v}
                          onPress={() => updateL2(l2Lang.code, { display: { ...l2Settings.display, traditional: o.v === 'true' } })}
                          className={`flex-1 py-2 items-center rounded-md ${String(l2Settings.display.traditional) === o.v ? 'bg-card' : ''}`}
                        >
                          <Text className={`text-xs font-semibold ${String(l2Settings.display.traditional) === o.v ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {o.l}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                {isKorean && <ToggleRow label={t('label.show_hanja')} value={(l2Settings.display as any).hanja !== false} onValueChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, hanja: v } } as any)} />}
                {isVietnamese && <ToggleRow label={t('label.show_hantu')} value={(l2Settings.display as any).byeonggi !== false} onValueChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, byeonggi: v } } as any)} />}
              </View>

              <View className="mb-5 px-4">
                <SectionHeader title={t('setting.interaction')} />
                <ToggleRow label={t('setting.quiz_mode')} desc={t('msg.quiz_mode_desc')} value={tokenizedText.mode === 'quiz'} onValueChange={(v) => updateTokenizedText({ mode: v ? 'quiz' : 'normal' })} />
              </View>
            </>
          )}
        </View>
      )}

      {/* ── Playback tab ── */}
      {tab === 'playback' && (
        <View className="pt-1">
          <View className="mb-5 px-4">
            <SectionHeader title={t('setting.captions')} />
            <ToggleRow label={t('label.transcript_mode')} desc={t('msg.transcript_mode_desc')} value={playback.transcriptMode === 'transcript'} onValueChange={(v) => updatePlayback({ transcriptMode: v ? 'transcript' : 'subtitles' })} />
            <ToggleRow label={t('label.smooth_scroll')} value={playback.smoothScroll} onValueChange={(v) => updatePlayback({ smoothScroll: v })} />
            <ToggleRow label={t('label.karaoke')} value={playback.karaokeMode} onValueChange={(v) => updatePlayback({ karaokeMode: v })} />
          </View>
          <View className="mb-5 px-4">
            <ToggleRow label={t('label.auto_pause')} value={playback.autoPause} onValueChange={(v) => updatePlayback({ autoPause: v })} />
            <ToggleRow label={t('label.collapse_video')} value={playback.collapsedVideo} onValueChange={(v) => updatePlayback({ collapsedVideo: v })} />
          </View>
        </View>
      )}

      {/* ── Speech tab ── */}
      {tab === 'speech' && (
        <View className="px-4">
          <VoicePicker />
        </View>
      )}

      {/* ── Review tab ── */}
      {tab === 'review' && (
        <View className="px-4">
          <StepperRow
            label={t('label.new_cards_per_day')}
            desc={t('msg.new_cards_per_day_desc')}
            value={review.dailyNewLimit}
            min={1}
            max={50}
            onDecrement={() => updateReview({ dailyNewLimit: Math.max(1, review.dailyNewLimit - 1) })}
            onIncrement={() => updateReview({ dailyNewLimit: Math.min(50, review.dailyNewLimit + 1) })}
          />
        </View>
      )}
    </ScrollView>
  );
}
