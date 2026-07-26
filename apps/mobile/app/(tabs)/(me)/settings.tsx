import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import * as Switch from '@/components/ui/switch';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { getSampleSentence } from '@langplayer/shared';
import { VoicePicker } from '@/components/VoicePicker';
import { TokenizedText } from '@/components/TokenizedText';
import { Download } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

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
      <Switch.Root checked={value} onCheckedChange={onValueChange} />
    </View>
  );
}

function SliderRow({
  label,
  desc,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  valueDisplay,
  leftLabel,
  rightLabel,
  centerLabel,
}: {
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number) => void;
  valueDisplay?: string;
  leftLabel?: string;
  rightLabel?: string;
  centerLabel?: string;
}) {
  return (
    <View className="py-2.5">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-base font-semibold text-foreground tabular-nums">
          {valueDisplay ?? value}
        </Text>
      </View>
      {desc ? <Text className="text-xs text-muted-foreground mb-2">{desc}</Text> : null}
      <Slider
        style={{ width: '100%', height: 40 }}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={ICON_PRIMARY}
        maximumTrackTintColor={ICON_MUTED}
        thumbTintColor={ICON_PRIMARY}
      />
      <View className="flex-row justify-between -mt-1">
        <Text className="text-xs text-muted-foreground">{leftLabel ?? String(min)}</Text>
        {centerLabel ? (
          <Text className="text-xs text-muted-foreground">{centerLabel}</Text>
        ) : null}
        <Text className="text-xs text-muted-foreground">{rightLabel ?? String(max)}</Text>
      </View>
    </View>
  );
}

// ── Main Screen ──────────────────────────────

export default function SettingsScreen() {
  const { l2Lang } = useLanguage();
  const { tokenizedText, updateTokenizedText, display, updateDisplay, playback, updatePlayback, review, updateReview, getL2, updateL2, ensureL2, loaded } = useSettingsContext();
  const t = useT();
  const router = useRouter();
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
                <SliderRow
                  label={t('label.text_size')}
                  value={tokenizedText.zoom}
                  min={0}
                  max={7}
                  onValueChange={(v) => updateTokenizedText({ zoom: v })}
                  valueDisplay={`${Math.round(([1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const)[tokenizedText.zoom] * 16)}px`}
                  leftLabel={t('setting.smaller')}
                  rightLabel={t('setting.bigger')}
                  centerLabel={`${Math.round(1 * 16)}–${Math.round(2.25 * 16)}px`}
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
                {isKorean && <ToggleRow label={t('label.show_hanja')} value={l2Settings.display.byeonggi !== false} onValueChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, byeonggi: v } })} />}
                {isVietnamese && <ToggleRow label={t('label.show_hantu')} value={l2Settings.display.byeonggi !== false} onValueChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, byeonggi: v } })} />}
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
            <Text className="text-sm font-medium text-foreground mb-1.5">{t('label.captions_display_as')}</Text>
            <SegmentedRow
              options={['transcript', 'subtitles'] as const}
              value={playback.transcriptMode}
              onChange={(v) => updatePlayback({ transcriptMode: v })}
              renderLabel={(v) => t(v === 'transcript' ? 'title.transcript' : 'label.subtitles')}
            />
            <Text className="text-xs text-muted-foreground mt-1.5">{t('msg.captions_display_as_desc', { transcriptLabel: t('title.transcript'), subtitlesLabel: t('label.subtitles') })}</Text>
            {playback.transcriptMode === 'transcript' && (
              <ToggleRow label={t('label.smooth_scroll')} value={playback.smoothScroll} onValueChange={(v) => updatePlayback({ smoothScroll: v })} />
            )}
            <ToggleRow label={t('label.karaoke')} value={playback.karaokeMode} onValueChange={(v) => updatePlayback({ karaokeMode: v })} />
          </View>
          <View className="mb-5 px-4">
            <SectionHeader title={t('setting.playback')} />
            <ToggleRow label={t('label.auto_pause')} value={playback.autoPause} onValueChange={(v) => updatePlayback({ autoPause: v })} />
          </View>
        </View>
      )}

      {/* ── Speech tab ── */}
      {tab === 'speech' && (
        <View className="px-4">
          <VoicePicker />
        </View>
      )}

      {tab === 'review' && (
        <View className="px-4">
          <SliderRow
            label={t('label.new_cards_per_day')}
            desc={t('msg.new_cards_per_day_desc')}
            value={review.dailyNewLimit}
            min={1}
            max={50}
            onValueChange={(v) => updateReview({ dailyNewLimit: v })}
            leftLabel="1"
            centerLabel={t('msg.default_value', { n: 20 })}
            rightLabel="50"
          />
        </View>
      )}

      {/* ── Offline Dictionaries ── */}
      <View className="mx-4 mt-5 mb-5 border-t border-border pt-4">
        <Pressable
          onPress={() => router.push('/(tabs)/(me)/offline-dictionaries' as any)}
          className="flex-row items-center gap-3 rounded-lg bg-card border border-border px-4 py-3"
        >
          <Download size={20} color={ICON_MUTED} />
          <Text className="flex-1 text-sm font-medium text-foreground">
            {t('title.offline_dictionaries')}
          </Text>
          <Text className="text-xs text-muted-foreground">›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
