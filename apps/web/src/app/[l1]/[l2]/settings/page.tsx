'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { languageName } from '@/lib/language-data';
import { getSampleSentence } from '@langplayer/shared';
import { TokenizedText } from '@/components/tokenized-text';
import { VoicePicker } from '@/components/voice-picker';
import { TabbedPanel } from '@/components/tabbed-panel';

export default function SettingsPage() {
  const { l1, l2 } = useLanguage();
  const {
    tokenizedText, updateTokenizedText,
    display, updateDisplay,
    playback, updatePlayback,
    review, updateReview,
    getL2, updateL2, ensureL2,
    loaded,
  } = useSettingsContext();
  const { setTheme } = useTheme();
  const t = useT();

  const [tab, setTab] = useState<'display' | 'playback' | 'speech' | 'review'>('display');
  const isChinese = l2.code === 'zh';
  const isKorean = l2.code === 'ko';
  const isVietnamese = l2.code === 'vi';

  useEffect(() => { if (loaded) ensureL2(l2.code); }, [l2.code, loaded, ensureL2]);

  const l2Settings = getL2(l2.code);
  const phoneticsEnabled = l2Settings.tokenSpan.phonetics.show !== false;
  const popupEnabled = tokenizedText.enabled;

  // ── Reusable components ──

  const Toggle = ({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div>
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <span className="text-sm font-medium">{label}</span>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
        <span className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
          <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
          <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-primary/20 after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-background after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
        </span>
      </label>
    </div>
  );

  const Segmented = <T extends string | boolean>({ label, options, value, onChange }: {
    label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
  }) => (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="inline-flex rounded-lg border border-border bg-muted p-1">
        {options.map(opt => (
          <button key={String(opt.value)} onClick={() => onChange(opt.value)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              value === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  const Slider = ({ label, desc, min, max, step, value, onChange, leftLabel, rightLabel, centerLabel }: {
    label: string; desc?: string; min: number; max: number; step: number; value: number;
    onChange: (v: number) => void; leftLabel?: string; rightLabel?: string; centerLabel?: string;
  }) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {desc && <p className="text-xs text-muted-foreground mb-3">{desc}</p>}
      <div className="flex items-center gap-4">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 h-2 rounded-full appearance-none bg-muted cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer" />
        <span className="w-10 text-center text-lg font-semibold tabular-nums">{value}</span>
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-muted-foreground">{leftLabel ?? min}</span>
        {centerLabel && <span className="text-xs text-muted-foreground">{centerLabel}</span>}
        <span className="text-xs text-muted-foreground">{rightLabel ?? max}</span>
      </div>
    </div>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">{title}</h3>
      {children}
    </div>
  );

  const previewText = getSampleSentence(l2.code);

  if (!loaded) {
    return <div className="mx-auto max-w-lg px-4 py-12 text-center text-muted-foreground">{t('msg.loading')}</div>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title.settings')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.settings_desc', { l1: languageName(l1.code), l2: languageName(l2.code, l1.code) })}
      </p>

      <TabbedPanel
        tabs={(['display', 'playback', 'speech', 'review'] as const).map(tabKey => ({
          key: tabKey,
          label: t(`setting.${tabKey}`),
        }))}
        activeTab={tab}
        onTabChange={setTab}
        className="mt-8"
        contentClassName="p-5"
      >
        {/* ═══ DISPLAY ═══ */}
        {tab === 'display' && (
          <div className="space-y-6">

          <Section title={t('setting.theme')}>
            <Segmented label={t('label.theme')} value={display.theme}
              onChange={(v: string) => {
                const theme = v as 'light' | 'dark' | 'system';
                updateDisplay({ theme });
                setTheme(theme);
              }}
              options={[
                { value: 'light', label: '☀️ ' + t('setting.light') },
                { value: 'dark', label: '🌙 ' + t('setting.dark') },
                { value: 'system', label: '💻 ' + t('setting.system') },
              ]} />
          </Section>

          <Section title="">
            <Toggle label={t('label.show_translation')} desc={t('msg.show_translation_desc')}
              checked={display.translation} onChange={v => updateDisplay({ translation: v })} />
            <Toggle label={t('label.enable_popup_dictionary')} desc={t('msg.enable_popup_dictionary_desc')}
              checked={tokenizedText.enabled} onChange={v => updateTokenizedText({ enabled: v })} />
          </Section>

          {popupEnabled && (
            <Section title={t('label.tokenized_text_preview')}>
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <TokenizedText text={previewText} l2Code={l2.code} textScale={tokenizedText.zoom} />
              </div>
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
              <Slider label={t('label.text_size')} min={0} max={7} step={1} value={tokenizedText.zoom}
                onChange={v => updateTokenizedText({ zoom: v })} leftLabel={t('setting.smaller')} rightLabel={t('setting.bigger')} />
            </Section>

            <Section title={t('setting.phonetics')}>
              <Segmented label={t('label.show_phonetics')}
                value={l2Settings.tokenSpan.phonetics.show === false ? 'off' : l2Settings.tokenSpan.phonetics.show}
                onChange={(v: string) => {
                  const ts = l2Settings.tokenSpan;
                  const show = v === 'off' ? false : v as 'ruby' | 'word';
                  // When replacing words, conditions must be 'always'
                  const conditions = show === 'word' ? 'always' : ts.phonetics.conditions;
                  updateL2(l2.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, show, conditions } } });
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
                    updateL2(l2.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, conditions: v as 'always' | 'hardWords' } } });
                  }}
                  options={[
                    { value: 'always', label: t('setting.all_words') },
                    { value: 'hardWords', label: t('setting.hard_words_only') },
                  ]} />
              )}
            </Section>

            <Section title={t('setting.word_level_display')}>
              <Toggle label={t('label.show_gloss_saved')} desc={t('msg.show_gloss_saved_desc')}
                checked={tokenizedText.quickGloss} onChange={v => updateTokenizedText({ quickGloss: v })} />
              <Toggle label={t('label.show_interlinear_gloss')} desc={t('msg.show_definition_desc')}
                checked={l2Settings.tokenSpan.definition.show}
                onChange={v => {
                  const ts = l2Settings.tokenSpan;
                  updateL2(l2.code, { tokenSpan: { ...ts, definition: { show: v } } });
                }} />
              {isChinese && (
                <Segmented label={t('label.character_set')} value={l2Settings.display.traditional}
                  onChange={(v: boolean) => updateL2(l2.code, { display: { ...l2Settings.display, traditional: v } })}
                  options={[
                    { value: false, label: '简 ' + t('setting.simplified') },
                    { value: true, label: '繁 ' + t('setting.traditional') },
                  ]} />
              )}
              {isKorean && (
                <Toggle label={t('label.show_hanja')}
                  checked={l2Settings.display.byeonggi}
                  onChange={v => updateL2(l2.code, { display: { ...l2Settings.display, byeonggi: v } })} />
              )}
              {isVietnamese && (
                <Toggle label={t('label.show_hantu')}
                  checked={l2Settings.display.byeonggi}
                  onChange={v => updateL2(l2.code, { display: { ...l2Settings.display, byeonggi: v } })} />
              )}
            </Section>

            <Section title={t('setting.interaction')}>
              <Toggle label={t('setting.quiz_mode')} desc={t('msg.quiz_mode_desc')}
                checked={tokenizedText.mode === 'quiz'}
                onChange={v => updateTokenizedText({ mode: v ? 'quiz' : 'normal' })} />
            </Section>
          </>)}
        </div>
      )}

      {/* ═══ PLAYBACK ═══ */}
      {tab === 'playback' && (
        <div className="space-y-6">

          <Section title={t('setting.captions')}>
            <Toggle label={t('label.transcript_mode')} desc={t('msg.transcript_mode_desc')}
              checked={playback.transcriptMode === 'transcript'}
              onChange={v => updatePlayback({ transcriptMode: v ? 'transcript' : 'subtitles' })} />
            <Toggle label={t('label.smooth_scroll')} checked={playback.smoothScroll}
              onChange={v => updatePlayback({ smoothScroll: v })} />
            <Toggle label={t('label.karaoke')} checked={playback.karaokeMode}
              onChange={v => updatePlayback({ karaokeMode: v })} />
          </Section>

          <Toggle label={t('label.auto_pause')} checked={playback.autoPause}
            onChange={v => updatePlayback({ autoPause: v })} />
          <Toggle label={t('label.collapse_video')} checked={playback.collapsedVideo}
            onChange={v => updatePlayback({ collapsedVideo: v })} />
        </div>
      )}

      {/* ═══ SPEECH ═══ */}
      {tab === 'speech' && (
        <VoicePicker />
      )}

      {/* ═══ REVIEW ═══ */}
      {tab === 'review' && (
        <div className="space-y-6">
          <Slider label={t('label.new_cards_per_day')} desc={t('msg.new_cards_per_day_desc')}
            min={1} max={50} step={1} value={review.dailyNewLimit}
            onChange={v => updateReview({ dailyNewLimit: v })}
            leftLabel="1" centerLabel={t('msg.default_value', { n: 20 })} rightLabel="50" />
        </div>
      )}
      </TabbedPanel>
    </div>
  );
}
