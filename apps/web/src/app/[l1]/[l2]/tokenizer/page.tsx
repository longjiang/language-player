'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { TokenizedText } from '@/components/tokenized-text';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { loadSampleShort } from '@langplayer/shared';

export default function TokenizerPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const [customText, setCustomText] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [key, setKey] = useState(0); // force remount
  const [sampleText, setSampleText] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSampleText('');
    loadSampleShort(l2.code)
      .then((text) => {
        if (!cancelled) setSampleText(text);
      })
      .catch(() => {
        // No authored sample for this language yet — leave the sample button disabled.
      });
    return () => {
      cancelled = true;
    };
  }, [l2.code]);

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title.tokenizer_test')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.tokenizer_desc', { l2: languageName(l2.code, l1.code) })}
      </p>

      {/* ── Input ── */}
      <div className="mt-8 space-y-4">
        <textarea
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder={t('placeholder.enter_text', { l2: languageName(l2.code, l1.code) })}
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
          <TokenizedText key={key} text={displayText} l2Code={l2.code} textScale={1} />
        </div>
      )}
    </div>
  );
}
