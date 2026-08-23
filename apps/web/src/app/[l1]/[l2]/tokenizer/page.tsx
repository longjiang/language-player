'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { languageName, flagEmoji } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { TokenizedText } from '@/components/tokenized-text';
import { Button } from '@/components/ui/button';
import { SliderRow } from '../settings/_components/SliderRow';
import { Sparkles } from 'lucide-react';
import { loadSampleShort, POPULAR_L2S } from '@langplayer/shared';

const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;

/** Test languages: the current L2 first, then all POPULAR_L2S (deduped). */
function testLanguages(current: string): string[] {
  return [current, ...POPULAR_L2S.filter((code) => code !== current)];
}

export default function TokenizerPage() {
  const { l1, l2 } = useLanguage();
  const { tokenizedText, updateTokenizedText } = useSettingsContext();
  const t = useT();
  // The language whose tokenization this page currently tests. Defaults to the
  // current L2, but any POPULAR_L2S language can be selected.
  const [selectedL2, setSelectedL2] = useState(l2.code);
  const [customText, setCustomText] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [key, setKey] = useState(0); // force remount
  const [sampleText, setSampleText] = useState('');

  const languages = useMemo(() => testLanguages(l2.code), [l2.code]);
  const zoomRem = ZOOM_TO_REM[tokenizedText.zoom] ?? 1;

  useEffect(() => {
    let cancelled = false;
    setSampleText('');
    loadSampleShort(selectedL2)
      .then((text) => {
        if (!cancelled) setSampleText(text);
      })
      .catch(() => {
        // No authored sample for this language yet — leave the sample button disabled.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedL2]);

  const handleUseSample = () => {
    setCustomText(sampleText);
    setDisplayText(sampleText);
    setKey(k => k + 1);
  };

  const handleTokenize = () => {
    const text = customText.trim() || sampleText;
    setDisplayText(text);
    setKey(k => k + 1);
  };

  const handleSelectLanguage = (code: string) => {
    if (code === selectedL2) return;
    setSelectedL2(code);
    setCustomText('');
    setDisplayText('');
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title.tokenizer_test')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.tokenizer_desc', { l2: languageName(selectedL2, l1.code) })}
      </p>

      {/* ── Text size + line spacing sliders (tied to settings) ── */}
      <div className="mt-8 rounded-lg border border-border bg-card p-4 space-y-5">
        <SliderRow
          label={t('label.text_size')}
          min={0} max={7} step={1} value={tokenizedText.zoom}
          onChange={v => updateTokenizedText({ zoom: v })}
          valueDisplay={`${Math.round(zoomRem * 16)}px`}
          leftLabel={t('setting.smaller')}
          rightLabel={t('setting.bigger')}
          centerLabel={`${Math.round(ZOOM_TO_REM[0] * 16)}–${Math.round(ZOOM_TO_REM[7] * 16)}px`}
        />
        <SliderRow
          label={t('setting.leading')}
          min={1} max={2} step={0.125} value={tokenizedText.leading ?? 1.625}
          onChange={v => updateTokenizedText({ leading: v })}
          valueDisplay={`×${(tokenizedText.leading ?? 1.625).toFixed(2)}`}
          leftLabel="1×"
          rightLabel="2×"
        />
      </div>

      {/* ── Language selector: current L2 + all POPULAR_L2S ── */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t('label.languages')}</h2>
        <div className="flex flex-wrap gap-2">
          {languages.map((code) => {
            const active = code === selectedL2;
            return (
              <button
                key={code}
                onClick={() => handleSelectLanguage(code)}
                title={languageName(code, l1.code)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground'
                }`}
              >
                <span className="mr-1">{flagEmoji(code)}</span>
                {languageName(code, l1.code)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Input ── */}
      <div className="mt-8 space-y-4">
        <textarea
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder={t('placeholder.enter_text', { l2: languageName(selectedL2, l1.code) })}
          className="w-full min-h-[100px] rounded-lg border bg-background p-4 text-sm"
          rows={4}
        />
        <div className="flex gap-2">
          <Button onClick={handleTokenize} disabled={!customText.trim() && !sampleText}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t('action.tokenize')}
          </Button>
          <Button variant="outline" onClick={handleUseSample} disabled={!sampleText}>
            {t('action.use_sample_text')}
          </Button>
        </div>
      </div>

      {/* ── Output ── */}
      {displayText && (
        <div className="mt-8 rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">{t('title.tokenized_result')}</h2>
          {/* Block-level TokenizedText applies the user zoom + leading from
              settings (SPEC-051) automatically, so the sliders above drive it. */}
          <TokenizedText key={`${key}-${selectedL2}`} text={displayText} l2Code={selectedL2} textScale={1} />
        </div>
      )}
    </div>
  );
}
