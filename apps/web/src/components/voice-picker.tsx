'use client';

import React, { useState, useEffect } from 'react';
import { useSpeech } from '@/hooks/use-speech';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { languageName } from '@/lib/language-data';
import { Volume2, Square } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from '@/components/ui/select';

interface VoicePickerProps {
  className?: string;
}

/** Voice picker dropdown for TTS settings. Auto-selects best voice per language.
 *  Speech settings are persisted via l2.speech (V2 unified store). */
export function VoicePicker({ className = '' }: VoicePickerProps) {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { getL2, updateL2, loaded } = useSettingsContext();
  const { getAllVoices, speak, stop, isSpeaking } = useSpeech();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const l2Settings = loaded && l2 ? getL2(l2.code) : null;
  const voiceURI = l2Settings?.speech.voiceURI ?? undefined;
  const rate = l2Settings?.speech.rate ?? 1.0;

  useEffect(() => {
    // Voices may load asynchronously
    const loadVoices = () => {
      setVoices(getAllVoices());
    };
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [getAllVoices]);

  // Filter voices for current L2
  const l2Voices = l2 ? voices.filter(v => v.lang.startsWith(`${l2.code}-`) || v.lang === l2.code) : [];
  const allLangVoices = l2 ? voices.filter(v => !v.lang.startsWith(`${l2.code}-`)) : voices;

  const autoValue = '__auto__';

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Voice selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">{t('label.pronunciation_voice')}</label>
        <Select
          value={voiceURI ?? autoValue}
          onValueChange={(v) => {
            if (!l2 || !l2Settings) return;
            updateL2(l2.code, { speech: { ...l2Settings.speech, voiceURI: v === autoValue ? null : v } });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('label.auto_best_for', { l2: l2?.code?.toUpperCase() ?? 'L2' })} />
          </SelectTrigger>
          <SelectContent>
            {/* Auto option */}
            <SelectItem value={autoValue}>
              <Volume2 className="h-4 w-4" />
              {t('label.auto_best_available')}
            </SelectItem>

            {/* L2 voices */}
            {l2Voices.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t('label.l2_voices', { l2: l2?.code?.toUpperCase() })}</SelectLabel>
                {l2Voices.map(v => (
                  <SelectItem key={v.voiceURI} value={v.voiceURI}>
                    <Volume2 className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{v.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">{v.lang}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {/* All other voices */}
            {allLangVoices.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t('label.all_voices')}</SelectLabel>
                {allLangVoices.map(v => (
                  <SelectItem key={v.voiceURI} value={v.voiceURI}>
                    <Volume2 className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{v.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">{v.lang}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Rate slider */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">
          {t('label.speech_rate', { rate: rate.toFixed(2) })}
        </label>
        <input
          type="range"
          min="0.25"
          max="2"
          step="0.05"
          value={rate}
          onChange={e => {
            if (!l2 || !l2Settings) return;
            updateL2(l2.code, { speech: { ...l2Settings.speech, rate: parseFloat(e.target.value) } });
          }}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{t('setting.slow')}</span>
          <span>{t('setting.fast')}</span>
        </div>
      </div>

      {/* Test button */}
      <div className="space-y-1.5 pt-2 border-t border-border">
        <label className="text-sm font-medium text-muted-foreground">{t('label.test_voice')}</label>
        {isSpeaking ? (
          <button
            onClick={stop}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
          >
            <Square className="h-4 w-4" />
            {t('action.stop')}
          </button>
        ) : (
          <button
            onClick={() => { if (l2) speak(l2.name ?? l2.code, l2.code, rate); }}
            disabled={!l2}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Volume2 className="h-4 w-4" />
            {t('label.play_pronunciation_for', { language: l2 ? languageName(l2.code, l1.code) : '' })}
          </button>
        )}
      </div>
    </div>
  );
}
