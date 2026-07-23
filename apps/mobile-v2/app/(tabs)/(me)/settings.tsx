import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';

// ── Sample sentences for tokenized text preview ──

const SAMPLES: Record<string, string> = {
  zh: '好好学习，天天向上。',
  yue: '我哋一齊學廣東話。',
  ja: '毎日少しずつ日本語を勉強しています。',
  ko: '매일 조금씩 한국어를 공부하고 있어요.',
  en: 'The quick brown fox jumps over the lazy dog.',
  fr: 'Le renard brun rapide saute par-dessus le chien paresseux.',
  de: 'Der schnelle braune Fuchs springt über den faulen Hund.',
  es: 'El rápido zorro marrón salta sobre el perro perezoso.',
  it: 'La volpe marrone veloce salta sopra il cane pigro.',
  pt: 'A rápida raposa castanha salta sobre o cão preguiçoso.',
  ru: 'Быстрая коричневая лиса прыгает через ленивую собаку.',
  nl: 'De snelle bruine vos springt over de luie hond.',
  sv: 'Den snabba bruna räven hoppar över den lata hunden.',
  no: 'Den raske brune reven hopper over den late hunden.',
  da: 'Den hurtige brune ræv springer over den dovne hund.',
  fi: 'Nopea ruskea kettu hyppää laiskan koiran yli.',
  pl: 'Szybki brązowy lis przeskakuje nad leniwym psem.',
  cs: 'Rychlá hnědá liška skáče přes líného psa.',
  el: 'Η γρήγορη καφέ αλεπού πηδά πάνω από το τεμπέλικο σκυλί.',
  hu: 'A gyors barna róka átugrik a lusta kutya fölött.',
  ro: 'Vulpea maro rapidă sare peste câinele leneș.',
  tr: 'Hızlı kahverengi tilki tembel köpeğin üzerinden atlar.',
  uk: 'Швидка коричнева лисиця стрибає через ледачого собаку.',
  ca: 'La guineu marró ràpida salta sobre el gos mandrós.',
  ga: 'Léimeann an sionnach donn tapa thar an madra leisciúil.',
  hr: 'Brza smeđa lisica preskače lijenog psa.',
  sr: 'Брза смеђа лисица прескаче лењог пса.',
  vi: 'Con cáo nâu nhanh nhẹn nhảy qua con chó lười biếng.',
  th: 'สุนัขจิ้งจอกสีน้ำตาลกระโดดข้ามสุนัขขี้เกียจ',
  hi: 'तेज़ भूरी लोमड़ी आलसी कुत्ते के ऊपर कूदती है।',
  id: 'Rubah cokelat cepat melompati anjing yang malas.',
  ms: 'Musang coklat pantas melompat ke atas anjing yang malas.',
  ar: 'الثعلب البني السريع يقفز فوق الكلب الكسول.',
  fa: 'روباه قهوه‌ای سریع از روی سگ تنبل می‌پرد.',
  sw: 'Mbweha mwepesi wa kahawia anaruka juu ya mbwa mvivu.',
  af: 'Die vinnige bruin jakkals spring oor die lui hond.',
};

const FALLBACK_SAMPLE = 'Lorem ipsum dolor sit amet consectetur adipiscing elit.';

function getSampleSentence(code: string): string {
  return SAMPLES[code] ?? FALLBACK_SAMPLE;
}

// ── Reusable sub-components ──

interface ToggleProps {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function Toggle({ label, desc, checked, onChange }: ToggleProps) {
  return (
    <View className="flex-row items-center justify-between py-3">
      <View className="flex-1 pr-4">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {desc ? <Text className="mt-0.5 text-xs text-muted-foreground">{desc}</Text> : null}
      </View>
      <Switch
        value={checked}
        onValueChange={onChange}
        trackColor={{ false: ICON_MUTED, true: '#3b82f6' }}
      />
    </View>
  );
}

interface SegmentedProps<T extends string | boolean> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

function Segmented<T extends string | boolean>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <View className="py-2">
      <Text className="mb-2 text-sm font-medium text-foreground">{label}</Text>
      <View className="flex-row rounded-lg border border-border bg-muted p-1">
        {options.map((opt) => (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            className={`flex-1 rounded-md px-3 py-2 ${
              value === opt.value ? 'bg-background shadow-sm' : ''
            }`}
          >
            <Text
              className={`text-center text-sm font-medium ${
                value === opt.value ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface TextSizeControlProps {
  label: string;
  desc?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  leftLabel?: string;
  rightLabel?: string;
}

function TextSizeControl({ label, desc, min, max, step, value, onChange, leftLabel, rightLabel }: TextSizeControlProps) {
  const decrease = () => onChange(Math.max(min, value - step));
  const increase = () => onChange(Math.min(max, value + step));

  return (
    <View className="py-2">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      {desc ? <Text className="mt-0.5 text-xs text-muted-foreground">{desc}</Text> : null}
      <View className="mt-2 flex-row items-center justify-between">
        <Pressable
          onPress={decrease}
          disabled={value <= min}
          className={`h-9 w-9 items-center justify-center rounded-lg border ${
            value <= min ? 'border-border bg-muted' : 'border-border bg-card active:bg-muted'
          }`}
        >
          <Text className={`text-lg ${value <= min ? 'text-muted-foreground/40' : 'text-foreground'}`}>−</Text>
        </Pressable>
        <View className="items-center">
          <Text className="text-2xl font-bold tabular-nums text-foreground">{value}</Text>
        </View>
        <Pressable
          onPress={increase}
          disabled={value >= max}
          className={`h-9 w-9 items-center justify-center rounded-lg border ${
            value >= max ? 'border-border bg-muted' : 'border-border bg-card active:bg-muted'
          }`}
        >
          <Text className={`text-lg ${value >= max ? 'text-muted-foreground/40' : 'text-foreground'}`}>+</Text>
        </Pressable>
      </View>
      {(leftLabel || rightLabel) && (
        <View className="mt-1 flex-row justify-between">
          <Text className="text-xs text-muted-foreground">{leftLabel ?? min}</Text>
          <Text className="text-xs text-muted-foreground">{rightLabel ?? max}</Text>
        </View>
      )}
    </View>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <View className="mb-4">
      {title ? (
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

// ── Tab config ──

type TabKey = 'display' | 'playback' | 'speech' | 'review';

const TAB_KEYS: TabKey[] = ['display', 'playback', 'speech', 'review'];

// ── Main component ──

export default function SettingsScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const {
    tokenizedText,
    updateTokenizedText,
    display,
    updateDisplay,
    playback,
    updatePlayback,
    review,
    updateReview,
    getL2,
    updateL2,
    ensureL2,
    loaded,
  } = useSettingsContext();
  const t = useT();

  const [tab, setTab] = useState<TabKey>('display');
  const isChinese = l2Lang.code === 'zh';
  const isKorean = l2Lang.code === 'ko';
  const isVietnamese = l2Lang.code === 'vi';

  useEffect(() => {
    if (loaded) ensureL2(l2Lang.code);
  }, [l2Lang.code, loaded, ensureL2]);

  const l2Settings = getL2(l2Lang.code);
  const popupEnabled = tokenizedText.enabled;

  const previewText = getSampleSentence(l2Lang.code);

  // ── Tab labels ──

  const tabLabels: Record<TabKey, string> = {
    display: t('setting.display'),
    playback: t('setting.playback'),
    speech: t('setting.speech'),
    review: t('setting.review'),
  };

  if (!loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4 py-12">
        <Text className="text-muted-foreground">{t('msg.loading')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1 px-4 py-5">
        <Text className="text-3xl font-bold text-foreground">{t('title.settings')}</Text>
        <Text className="mt-2 text-muted-foreground">
          {t('msg.settings_desc', { l1: l1Lang.name, l2: l2Lang.name })}
        </Text>

        {/* ═══ Tabs ═══ */}
        <View className="mt-8 flex-row rounded-lg border border-border bg-muted p-1">
          {TAB_KEYS.map((tabKey) => (
            <Pressable
              key={tabKey}
              onPress={() => setTab(tabKey)}
              className={`flex-1 rounded-md px-2 py-2 ${
                tab === tabKey ? 'bg-background shadow-sm' : ''
              }`}
            >
              <Text
                className={`text-center text-sm font-medium ${
                  tab === tabKey ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {tabLabels[tabKey]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ═══ Tab content ═══ */}
        <View className="mt-6">

          {/* ═══ DISPLAY ═══ */}
          {tab === 'display' && (
            <>

              <Section title={t('setting.theme')}>
                <Segmented
                  label={t('label.theme')}
                  value={display.theme}
                  onChange={(v: string) => updateDisplay({ theme: v as 'light' | 'dark' | 'system' })}
                  options={[
                    { value: 'light', label: '☀️ ' + t('setting.light') },
                    { value: 'dark', label: '🌙 ' + t('setting.dark') },
                    { value: 'system', label: '💻 ' + t('setting.system') },
                  ]}
                />
              </Section>

              <Section title="">
                <Toggle
                  label={t('label.show_translation')}
                  desc={t('msg.show_translation_desc')}
                  checked={display.translation}
                  onChange={(v) => updateDisplay({ translation: v })}
                />
                <Toggle
                  label={t('label.enable_popup_dictionary')}
                  desc={t('msg.enable_popup_dictionary_desc')}
                  checked={tokenizedText.enabled}
                  onChange={(v) => updateTokenizedText({ enabled: v })}
                />
              </Section>

              {popupEnabled && (
                <Section title={t('label.tokenized_text_preview')}>
                  <View className="rounded-lg border border-border bg-muted/50 p-4">
                    <Text className="text-base leading-relaxed text-foreground">{previewText}</Text>
                  </View>
                </Section>
              )}

              {popupEnabled && (
                <>
                  <Section title={t('setting.text_appearance')}>
                    <Segmented
                      label={t('label.font')}
                      value={tokenizedText.typeFace}
                      onChange={(v: string) => updateTokenizedText({ typeFace: v as 'default' | 'serif' | 'sans-serif' })}
                      options={[
                        { value: 'default', label: t('setting.font_default') },
                        { value: 'serif', label: t('setting.font_serif') },
                        { value: 'sans-serif', label: t('setting.font_sans_serif') },
                      ]}
                    />
                    <TextSizeControl
                      label={t('label.text_size')}
                      min={0}
                      max={7}
                      step={1}
                      value={tokenizedText.zoom}
                      onChange={(v) => updateTokenizedText({ zoom: v })}
                      leftLabel={t('setting.smaller')}
                      rightLabel={t('setting.bigger')}
                    />
                  </Section>

                  <Section title={t('setting.phonetics')}>
                    <Segmented
                      label={t('label.show_phonetics')}
                      value={
                        l2Settings.tokenSpan.phonetics.show === false
                          ? 'off'
                          : l2Settings.tokenSpan.phonetics.show
                      }
                      onChange={(v: string) => {
                        const ts = l2Settings.tokenSpan;
                        const show = v === 'off' ? false : (v as 'ruby' | 'word');
                        const conditions =
                          show === 'word' ? 'always' : ts.phonetics.conditions;
                        updateL2(l2Lang.code, {
                          tokenSpan: {
                            ...ts,
                            phonetics: { ...ts.phonetics, show, conditions },
                          },
                        });
                      }}
                      options={[
                        { value: 'ruby', label: t('setting.phonetics_on_top') },
                        { value: 'word', label: t('setting.phonetics_replace') },
                        { value: 'off', label: t('setting.off') },
                      ]}
                    />
                    {l2Settings.tokenSpan.phonetics.show === 'ruby' && (
                      <Segmented
                        label={t('label.phonetics_conditions')}
                        value={l2Settings.tokenSpan.phonetics.conditions}
                        onChange={(v: string) => {
                          const ts = l2Settings.tokenSpan;
                          updateL2(l2Lang.code, {
                            tokenSpan: {
                              ...ts,
                              phonetics: {
                                ...ts.phonetics,
                                conditions: v as 'always' | 'hardWords',
                              },
                            },
                          });
                        }}
                        options={[
                          { value: 'always', label: t('setting.all_words') },
                          { value: 'hardWords', label: t('setting.hard_words_only') },
                        ]}
                      />
                    )}
                  </Section>

                  <Section title={t('setting.word_level_display')}>
                    <Toggle
                      label={t('label.show_gloss_saved')}
                      desc={t('msg.show_gloss_saved_desc')}
                      checked={tokenizedText.quickGloss}
                      onChange={(v) => updateTokenizedText({ quickGloss: v })}
                    />
                    <Toggle
                      label={t('label.show_interlinear_gloss')}
                      desc={t('msg.show_definition_desc')}
                      checked={l2Settings.tokenSpan.definition.show}
                      onChange={(v) => {
                        const ts = l2Settings.tokenSpan;
                        updateL2(l2Lang.code, {
                          tokenSpan: { ...ts, definition: { show: v } },
                        });
                      }}
                    />
                    {isChinese && (
                      <Segmented
                        label={t('label.character_set')}
                        value={l2Settings.display.traditional}
                        onChange={(v: boolean) =>
                          updateL2(l2Lang.code, {
                            display: {
                              ...l2Settings.display,
                              traditional: v,
                            },
                          })
                        }
                        options={[
                          { value: false, label: '简 ' + t('setting.simplified') },
                          { value: true, label: '繁 ' + t('setting.traditional') },
                        ]}
                      />
                    )}
                    {isKorean && (
                      <Toggle
                        label={t('label.show_hanja')}
                        checked={l2Settings.display.byeonggi}
                        onChange={(v) =>
                          updateL2(l2Lang.code, {
                            display: { ...l2Settings.display, byeonggi: v },
                          })
                        }
                      />
                    )}
                    {isVietnamese && (
                      <Toggle
                        label={t('label.show_hantu')}
                        checked={l2Settings.display.byeonggi}
                        onChange={(v) =>
                          updateL2(l2Lang.code, {
                            display: { ...l2Settings.display, byeonggi: v },
                          })
                        }
                      />
                    )}
                  </Section>

                  <Section title={t('setting.interaction')}>
                    <Toggle
                      label={t('setting.quiz_mode')}
                      desc={t('msg.quiz_mode_desc')}
                      checked={tokenizedText.mode === 'quiz'}
                      onChange={(v) =>
                        updateTokenizedText({ mode: v ? 'quiz' : 'normal' })
                      }
                    />
                  </Section>
                </>
              )}
            </>
          )}

          {/* ═══ PLAYBACK ═══ */}
          {tab === 'playback' && (
            <>
              <Section title={t('setting.captions')}>
                <Toggle
                  label={t('label.transcript_mode')}
                  desc={t('msg.transcript_mode_desc')}
                  checked={playback.transcriptMode === 'transcript'}
                  onChange={(v) =>
                    updatePlayback({ transcriptMode: v ? 'transcript' : 'subtitles' })
                  }
                />
                <Toggle
                  label={t('label.smooth_scroll')}
                  checked={playback.smoothScroll}
                  onChange={(v) => updatePlayback({ smoothScroll: v })}
                />
                <Toggle
                  label={t('label.karaoke')}
                  checked={playback.karaokeMode}
                  onChange={(v) => updatePlayback({ karaokeMode: v })}
                />
              </Section>

              <Toggle
                label={t('label.auto_pause')}
                checked={playback.autoPause}
                onChange={(v) => updatePlayback({ autoPause: v })}
              />
              <Toggle
                label={t('label.collapse_video')}
                checked={playback.collapsedVideo}
                onChange={(v) => updatePlayback({ collapsedVideo: v })}
              />
            </>
          )}

          {/* ═══ SPEECH ═══ */}
          {tab === 'speech' && (
            <Section title="">
              <View className="rounded-lg border border-border bg-card p-6">
                <Text className="text-sm text-muted-foreground text-center">
                  {t('msg.speech_settings_coming_soon')}
                </Text>
              </View>
            </Section>
          )}

          {/* ═══ REVIEW ═══ */}
          {tab === 'review' && (
            <Section title="">
              <TextSizeControl
                label={t('label.new_cards_per_day')}
                desc={t('msg.new_cards_per_day_desc')}
                min={1}
                max={50}
                step={1}
                value={review.dailyNewLimit}
                onChange={(v) => updateReview({ dailyNewLimit: v })}
                leftLabel="1"
                rightLabel="50"
              />
            </Section>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
