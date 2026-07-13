'use client';

import React, { useState, useEffect } from 'react';
import { useSpeech } from '@/hooks/use-speech';
import { useLanguage } from '@/providers/language-provider';
import { ChevronDown, Volume2, Square } from 'lucide-react';

interface VoicePickerProps {
  className?: string;
}

/** Voice picker dropdown for TTS settings. Auto-selects best voice per language. */
export function VoicePicker({ className = '' }: VoicePickerProps) {
  const { l2 } = useLanguage();
  const { getAllVoices, voiceURI, setVoiceURI, rate, setRate, speak, stop, isSpeaking } = useSpeech();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [open, setOpen] = useState(false);

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

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Voice selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">Pronunciation Voice</label>
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-primary/50"
          >
            <span className="truncate">
              {voiceURI
                ? voices.find(v => v.voiceURI === voiceURI)?.name ?? 'Custom voice'
                : `Auto (best for ${l2?.code?.toUpperCase() ?? 'L2'})`}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </button>

          {open && (
            <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
              {/* Auto option */}
              <button
                onClick={() => { setVoiceURI(undefined); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${!voiceURI ? 'bg-primary/10 text-primary font-medium' : ''}`}
              >
                <Volume2 className="h-4 w-4" />
                Auto (best available)
              </button>

              {/* L2 voices */}
              {l2Voices.length > 0 && (
                <>
                  <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase border-t">
                    {l2?.code?.toUpperCase()} Voices
                  </div>
                  {l2Voices.map(v => (
                    <button
                      key={v.voiceURI}
                      onClick={() => { setVoiceURI(v.voiceURI); setOpen(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${voiceURI === v.voiceURI ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <Volume2 className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{v.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">{v.lang}</span>
                    </button>
                  ))}
                </>
              )}

              {/* All other voices */}
              {allLangVoices.length > 0 && (
                <>
                  <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase border-t">
                    All Voices
                  </div>
                  {allLangVoices.map(v => (
                    <button
                      key={v.voiceURI}
                      onClick={() => { setVoiceURI(v.voiceURI); setOpen(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${voiceURI === v.voiceURI ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <Volume2 className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{v.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">{v.lang}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rate slider */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">
          Speech Rate: {rate.toFixed(2)}×
        </label>
        <input
          type="range"
          min="0.25"
          max="2"
          step="0.05"
          value={rate}
          onChange={e => setRate(parseFloat(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Slow</span>
          <span>Fast</span>
        </div>
      </div>

      {/* Test button */}
      <div className="space-y-1.5 pt-2 border-t border-border">
        <label className="text-sm font-medium text-muted-foreground">Test Voice</label>
        {isSpeaking ? (
          <button
            onClick={stop}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
        ) : (
          <button
            onClick={() => { if (l2) speak(l2.name ?? l2.code, l2.code, rate); }}
            disabled={!l2}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Volume2 className="h-4 w-4" />
            Play {l2?.code?.toUpperCase() ?? ''} Pronunciation
          </button>
        )}
      </div>
    </div>
  );
}
